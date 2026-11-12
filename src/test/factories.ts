import { registerUser } from "../server/services/users";
import { createGroupWithPet } from "../server/services/groups";
import { petSchema } from "../server/validation";

let n = 0;
export async function makeUser(name = "User") {
  n++;
  const email = `user${n}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const u = await registerUser({ name: `${name} ${n}`, email, password: "password123", locale: "he" });
  return { ...u, email };
}

export async function makeGroup(adminId: string, petName = "Rex") {
  return createGroupWithPet(adminId, petSchema.parse({ name: petName, species: "dog" }));
}
