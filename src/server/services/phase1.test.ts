import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { groups, invitations } from "../db/schema";
import { makeGroup, makeUser } from "../../test/factories";
import { resetRateLimits } from "../rate-limit";
import { authenticate, registerUser } from "./users";
import { deleteGroup, listRestorableGroups, listUserGroups, restoreGroup } from "./groups";
import { getPetForMember, setPetPhoto, sniffImage, updatePet } from "./pets";
import { leaveGroup, listMembers, removeMember } from "./members";
import { acceptInvitation, createInvitation, listActiveInvitations, previewInvitation, revokeInvitation } from "./invitations";
import { invitationSchema, petSchema, registerSchema } from "../validation";

const code = async (p: Promise<unknown>) => {
  try { await p; return "ok"; } catch (e) { return (e as { code?: string }).code ?? String(e); }
};
const invite = (actor: string, g: string, o: Partial<{ reusable: boolean; email: string | null; expiresInDays: number }> = {}) =>
  createInvitation(actor, g, { reusable: false, email: null, expiresInDays: 7, ...o });

beforeEach(() => resetRateLimits());

describe("auth", () => {
  it("registers and logs in; rejects wrong password and duplicate email", async () => {
    await registerUser({ name: "A", email: "a@example.test", password: "password123", locale: "en" });
    expect(await authenticate("a@example.test", "password123", "ip")).toHaveProperty("id");
    expect(await code(authenticate("a@example.test", "wrong-pass", "ip"))).toBe("invalid_credentials");
    expect(await code(authenticate("nobody@example.test", "password123", "ip"))).toBe("invalid_credentials");
    expect(await code(registerUser({ name: "B", email: "a@example.test", password: "password123", locale: "he" }))).toBe("email_taken");
  });

  it("rate-limits repeated login attempts", async () => {
    for (let i = 0; i < 10; i++) await code(authenticate("rl@example.test", "x", "ip2"));
    expect(await code(authenticate("rl@example.test", "x", "ip2"))).toBe("rate_limited");
  });
});

describe("groups and members", () => {
  it("a user can belong to several groups", async () => {
    const a = await makeUser(), b = await makeUser();
    await makeGroup(a.id, "Rex");
    const g2 = await makeGroup(b.id, "Mitzi");
    await acceptInvitation(a.id, await invite(b.id, g2));
    expect((await listUserGroups(a.id)).map((g) => g.petName).sort()).toEqual(["Mitzi", "Rex"]);
  });

  it("non-members cannot read or change a group (same error as missing group)", async () => {
    const a = await makeUser(), outsider = await makeUser();
    const g = await makeGroup(a.id);
    expect(await code(getPetForMember(outsider.id, g))).toBe("not_found");
    expect(await code(getPetForMember(outsider.id, "no-such-group"))).toBe("not_found");
    expect(await code(listMembers(outsider.id, g))).toBe("not_found");
    expect(await code(invite(outsider.id, g))).toBe("not_found");
    expect(await code(updatePet(outsider.id, g, petSchema.parse({ name: "X", species: "cat" })))).toBe("not_found");
  });

  it("every member has the same rights, whoever created the group", async () => {
    const a = await makeUser(), c = await makeUser(), d = await makeUser();
    const g = await makeGroup(a.id);
    await acceptInvitation(c.id, await invite(a.id, g));
    await updatePet(c.id, g, petSchema.parse({ name: "Max", species: "dog" }));
    expect((await getPetForMember(a.id, g)).pet.name).toBe("Max");
    await acceptInvitation(d.id, await invite(c.id, g)); // an invited member can invite others
    await removeMember(d.id, g, a.id); // and remove anyone, including the creator
    expect(await code(getPetForMember(a.id, g))).toBe("not_found");
    await deleteGroup(d.id, g);
    expect(await listUserGroups(c.id)).toHaveLength(0);
  });

  it("the last member can't leave or be removed", async () => {
    const a = await makeUser(), c = await makeUser();
    const g = await makeGroup(a.id);
    expect(await code(leaveGroup(a.id, g))).toBe("last_member");
    expect(await code(removeMember(a.id, g, a.id))).toBe("last_member");
    await acceptInvitation(c.id, await invite(a.id, g));
    await leaveGroup(a.id, g); // now allowed
    expect(await code(getPetForMember(a.id, g))).toBe("not_found");
    expect(await code(leaveGroup(c.id, g))).toBe("last_member");
  });

  it("when the last two members leave or remove each other at once, one stays", async () => {
    for (const act of [(x: string, y: string, g: string) => removeMember(x, g, y), (x: string, _y: string, g: string) => leaveGroup(x, g)]) {
      const a = await makeUser(), b = await makeUser();
      const g = await makeGroup(a.id);
      await acceptInvitation(b.id, await invite(a.id, g));
      const results = await Promise.all([code(act(a.id, b.id, g)), code(act(b.id, a.id, g))]);
      expect(results.filter((r) => r === "ok")).toHaveLength(1);
      expect(await listMembers(a.id, g).catch(() => listMembers(b.id, g))).toHaveLength(1);
    }
  });

  it("removing a member from one group does not affect their other groups", async () => {
    const a = await makeUser(), c = await makeUser();
    const g1 = await makeGroup(a.id, "One"), g2 = await makeGroup(a.id, "Two");
    await acceptInvitation(c.id, await invite(a.id, g1));
    await acceptInvitation(c.id, await invite(a.id, g2));
    await removeMember(a.id, g1, c.id);
    expect((await listUserGroups(c.id)).map((g) => g.petName)).toEqual(["Two"]);
  });

  it("a removed member immediately loses access to that group", async () => {
    const a = await makeUser(), c = await makeUser();
    const g = await makeGroup(a.id);
    await acceptInvitation(c.id, await invite(a.id, g));
    expect((await getPetForMember(c.id, g)).pet.name).toBe("Rex");
    await removeMember(a.id, g, c.id);
    expect(await code(getPetForMember(c.id, g))).toBe("not_found");
    expect(await code(listMembers(c.id, g))).toBe("not_found");
    expect(await listUserGroups(c.id)).toHaveLength(0);
  });

  it("members cannot remove users who aren't in their group", async () => {
    const a = await makeUser(), x = await makeUser(), stranger = await makeUser();
    const g = await makeGroup(a.id);
    const gx = await makeGroup(x.id); // x is in another group
    expect(await code(removeMember(a.id, g, x.id))).toBe("not_found");
    expect(await code(removeMember(a.id, g, stranger.id))).toBe("not_found");
    expect(await code(removeMember(a.id, gx, x.id))).toBe("not_found"); // a isn't in gx
    expect(await code(getPetForMember(x.id, gx))).toBe("ok");
  });

  it("edits persist vet and insurance details", async () => {
    const a = await makeUser();
    const g = await makeGroup(a.id);
    await updatePet(a.id, g, petSchema.parse({
      name: "Rexy", species: "other", speciesOther: "Hedgehog", weightKg: "3.5", birthDate: "2020-05-01",
      vetName: "Dr. Levi", vetPhone: "03-1234567", insuranceProvider: "PetIns", insurancePolicyNumber: "P-9", insuranceExpiry: "2027-01-31",
    }));
    const { pet } = await getPetForMember(a.id, g);
    expect(pet).toMatchObject({ name: "Rexy", speciesOther: "Hedgehog", weightKg: 3.5, vetName: "Dr. Levi", insurancePolicyNumber: "P-9", breed: null });
  });

  it("pet validation rejects bad input", () => {
    const issues = (o: object) => petSchema.safeParse(o).error?.issues.map((i) => `${String(i.path[0])}:${i.message}`) ?? [];
    expect(issues({ name: "", species: "dog" })).toContain("name:required");
    expect(issues({ name: "A", species: "other" })).toContain("speciesOther:required");
    expect(issues({ name: "A", species: "dragon" })).toContain("species:required");
    expect(issues({ name: "A", species: "dog", birthDate: "2999-01-01" })).toContain("birthDate:future_date");
    expect(issues({ name: "A", species: "dog", weightKg: "-1" })).toContain("weightKg:invalid_number");
    expect(issues({ name: "x".repeat(81), species: "dog" })).toContain("name:too_long");
    expect(issues({ name: "A", species: "dog", estimatedAgeMonths: "12" })).toContain("estimatedAgeMonths:invalid_number");
    expect(issues({ name: "A", species: "dog", estimatedAgeYears: "1.5" })).toContain("estimatedAgeYears:invalid_number");
  });

  it("estimated age combines years and months", () => {
    const age = (y: string, m: string) => petSchema.parse({ name: "A", species: "dog", estimatedAgeYears: y, estimatedAgeMonths: m }).estimatedAgeYears;
    expect(Math.round(age!("1", "11")! * 12)).toBe(23);
    expect(age("", "6")).toBe(0.5);
    expect(age("3", "0")).toBe(3);
    expect(age("", "0")).toBeNull();
  });

  it("soft-deleted groups are hidden and restorable by any member, never by outsiders", async () => {
    const a = await makeUser(), c = await makeUser(), out = await makeUser();
    const g = await makeGroup(a.id);
    await acceptInvitation(c.id, await invite(a.id, g));
    await deleteGroup(a.id, g);
    expect(await listUserGroups(a.id)).toHaveLength(0);
    expect(await code(getPetForMember(c.id, g))).toBe("not_found");
    expect((await listRestorableGroups(c.id)).map((x) => x.groupId)).toEqual([g]);
    expect(await listRestorableGroups(out.id)).toEqual([]);
    expect(await code(restoreGroup(out.id, g))).toBe("not_found");
    await restoreGroup(c.id, g);
    expect(await listUserGroups(c.id)).toHaveLength(1);
  });

  it("restore fails after the 30-day window", async () => {
    const a = await makeUser();
    const g = await makeGroup(a.id);
    await db.update(groups).set({ deletedAt: new Date(Date.now() - 31 * 86400000) }).where(eq(groups.id, g));
    expect(await code(restoreGroup(a.id, g))).toBe("restore_expired");
  });
});

describe("invitations", () => {
  it("single-use links work once", async () => {
    const a = await makeUser(), b = await makeUser(), c = await makeUser();
    const g = await makeGroup(a.id);
    const t = await invite(a.id, g);
    expect((await previewInvitation(t))?.petName).toBe("Rex");
    await acceptInvitation(b.id, t);
    expect(await code(getPetForMember(b.id, g))).toBe("ok");
    expect(await code(acceptInvitation(c.id, t))).toBe("invite_invalid");
    expect(await previewInvitation(t)).toBeNull();
  });

  it("concurrent use of a single-use link admits exactly one user", async () => {
    const a = await makeUser(), b = await makeUser(), c = await makeUser();
    const g = await makeGroup(a.id);
    const t = await invite(a.id, g);
    const r = await Promise.all([code(acceptInvitation(b.id, t)), code(acceptInvitation(c.id, t))]);
    expect(r.filter((x) => x === "ok")).toHaveLength(1);
    expect(await listMembers(a.id, g)).toHaveLength(2);
  });

  it("reusable links work for several users; already-member does not consume", async () => {
    const a = await makeUser(), b = await makeUser(), c = await makeUser();
    const g = await makeGroup(a.id);
    const t = await invite(a.id, g, { reusable: true });
    await acceptInvitation(b.id, t);
    expect(await code(acceptInvitation(b.id, t))).toBe("already_member");
    await acceptInvitation(c.id, t);
    expect((await listActiveInvitations(a.id, g))[0].useCount).toBe(2);
  });

  it("active invitations expose their link token again; a tampered copy yields none", async () => {
    const a = await makeUser();
    const g = await makeGroup(a.id);
    const t = await invite(a.id, g);
    const [inv] = await listActiveInvitations(a.id, g);
    expect(inv.token).toBe(t);
    const row = await db.select({ enc: invitations.tokenEnc }).from(invitations).where(eq(invitations.id, inv.id)).get();
    expect(row?.enc).not.toContain(t); // not stored in plain text
    await db.update(invitations).set({ tokenEnc: row!.enc!.slice(0, -2) + "AA" }).where(eq(invitations.id, inv.id));
    expect((await listActiveInvitations(a.id, g))[0].token).toBeNull();
  });

  it("revoked and expired invitations cannot be used", async () => {
    const a = await makeUser(), b = await makeUser();
    const g = await makeGroup(a.id);
    const t1 = await invite(a.id, g);
    const [inv] = await listActiveInvitations(a.id, g);
    await revokeInvitation(a.id, g, inv.id);
    expect(await code(acceptInvitation(b.id, t1))).toBe("invite_invalid");

    await invite(a.id, g);
    const t2 = await invite(a.id, g);
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.groupId, g));
    expect(await code(acceptInvitation(b.id, t2))).toBe("invite_invalid");
  });

  it("revoking another group's invitation is not possible", async () => {
    const a = await makeUser(), x = await makeUser();
    const g = await makeGroup(a.id), gx = await makeGroup(x.id);
    await invite(a.id, g);
    const [inv] = await listActiveInvitations(a.id, g);
    expect(await code(revokeInvitation(x.id, gx, inv.id))).toBe("not_found");
  });

  it("email invitations only work for the invited address", async () => {
    const a = await makeUser(), b = await makeUser(), c = await makeUser();
    const g = await makeGroup(a.id);
    const t = await invite(a.id, g, { email: c.email });
    expect(await code(acceptInvitation(b.id, t))).toBe("invite_email_mismatch");
    await acceptInvitation(c.id, t);
  });

  it("emails are normalized at the boundary; email invites are always single-use", async () => {
    expect(registerSchema.parse({ name: "N", email: "  Mixed@Example.TEST ", password: "password123" }).email).toBe("mixed@example.test");
    expect(invitationSchema.parse({ email: "Mixed@Example.TEST" }).email).toBe("mixed@example.test");
    const a = await makeUser(), c = await makeUser();
    const g = await makeGroup(a.id);
    const t = await invite(a.id, g, { email: c.email, reusable: true });
    expect((await listActiveInvitations(a.id, g))[0].reusable).toBe(false);
    await acceptInvitation(c.id, t);
    expect(await previewInvitation(t)).toBeNull();
  });

  it("invitations to a deleted group cannot be used", async () => {
    const a = await makeUser(), b = await makeUser();
    const g = await makeGroup(a.id);
    const t = await invite(a.id, g);
    await deleteGroup(a.id, g);
    expect(await code(acceptInvitation(b.id, t))).toBe("invite_invalid");
  });
});

describe("pet photos", () => {
  it("detects image types from magic bytes", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))?.ext).toBe("png");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("rejects non-images and uploads by non-members", async () => {
    const a = await makeUser(), c = await makeUser();
    const g = await makeGroup(a.id);
    expect(await code(setPetPhoto(a.id, g, new TextEncoder().encode("<html>")))).toBe("invalid_photo");
    expect(await code(setPetPhoto(c.id, g, new Uint8Array([0xff, 0xd8, 0xff])))).toBe("not_found");
  });
});
