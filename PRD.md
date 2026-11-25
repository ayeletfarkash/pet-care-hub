# Pet Care Hub
## Product Requirements Document (PRD)

**Document status:** Initial Product Specification  
**Version:** 1.1  
**Target market:** Israel, with future international expansion  
**Platforms:** Responsive Web Application + Progressive Web App (PWA)  
**Languages:** Hebrew and English  
**Accessibility target:** WCAG 2.2 Level AA  
**Initial AI integration:** None

---

# 1. Product Overview

## 1.1 Product Vision

Pet Care Hub is a centralized pet-care management platform designed to help individuals and families coordinate all aspects of caring for their pets.

The application provides a shared environment where multiple people can manage a pet's daily care, medical history, medications, appointments, tasks, routines, food inventory, and purchases.

The system supports all types of pets, not only cats and dogs.

Its main purpose is to reduce the complexity of shared pet care, prevent missed responsibilities, and ensure that everyone involved has access to relevant and up-to-date information.

## 1.2 Core Value Proposition

- Centralize all pet-related information.
- Coordinate responsibilities between multiple caregivers.
- Track medical treatments and medication administration.
- Manage appointments, tasks, and recurring routines.
- Monitor food and product inventory.
- Receive relevant reminders and notifications.
- Provide operational insights based on application data.
- Offer an accessible experience for users with disabilities.

## 1.3 Target Users

- Individuals caring for one or more pets.
- Families sharing responsibility for pets.
- Couples and roommates.
- Pet owners working with external caregivers.
- People coordinating pet care across multiple households or care teams.

The application should be accessible to users without technical knowledge and designed to accommodate users with different accessibility needs.

---

# 2. Core System Concepts

## 2.1 User

A registered person with an individual account.

Each user has:
- Full name.
- Email address.
- Authentication credentials or linked authentication provider.
- Preferred interface language.
- Personal notification preferences.
- Membership in one or more pet groups.

A user can participate in multiple groups and may have different roles in each group.

## 2.2 Pet

A pet is the central entity around which all care information is organized.

Every pet belongs to exactly one group.

A pet cannot be transferred between groups in the MVP.

## 2.3 Group

A group represents the complete care team for one specific pet.

Core rules:
- Each group contains exactly one pet.
- Each pet belongs to exactly one group.
- A group can contain multiple users.
- A user can belong to multiple groups.
- Each user has one role per group.
- Group data is isolated from other groups.
- Users can be added to or removed from groups.
- There is no automatic information sharing between groups.

When a user creates a new pet group, they automatically become its first Admin.

Multiple Admins are allowed within the same group.

## 2.4 Unified Dashboard

The home dashboard provides a combined overview of all groups accessible to the current user.

Users can:
- View information across all their groups.
- Filter individual sections by group.
- Enter a specific group to view only that pet's information.

The dashboard distinguishes between:
- Group-level information.
- Tasks and responsibilities assigned to the current user.
- Personal reminders and notifications.

---

# 3. Members and Permissions

There are no roles (changed 2026-11-25; the original Admin/Caregiver split was removed). Every member of a group has the same rights: viewing, creating, editing and deleting everything in the group, inviting and removing members, and deleting or restoring the group.

Wherever this document still says "Admin", "Admins" or "Caregiver", read "any member of the group". Anything described as Admin approval no longer exists.

- Only members can access a group. Group data stays isolated from non-members.
- The last member cannot leave a group; they can delete it instead.
- Task handovers apply immediately, without approval.
- Doses and routine activities can be recorded for any past date.
- Membership must be enforced on the backend, not only by hiding interface elements.

---

# 4. Authentication and User Management

## 4.1 Registration and Login

Supported authentication methods:
- Email and password.
- Google authentication.
- Apple authentication.

OAuth / OpenID Connect should be used for authentication only.

The application must not request access to users' private data from Google or Apple beyond the minimum information required for authentication.

## 4.2 User Profile

The personal user profile contains:
- Full name.
- Email address.
- Preferred language.
- Notification preferences.

No additional personal profile fields are required for the MVP.

## 4.3 Group Invitations

Only Admins can invite users.

Supported invitation methods:
- Email invitation.
- Invitation link.

Invitation links support:
- One-time or reusable links.
- Configurable expiration.
- Revocation at any time.
- A configurable invitation role.

The default invitation role is Caregiver.

Admins can promote a Caregiver to Admin after joining.

## 4.4 Joining a Group

- Existing users log in and join the group.
- New users register and are automatically added after registration.
- Expired or revoked invitations cannot be used.
- The invitation's assigned role is applied upon joining.

## 4.5 Removing Members

Only Admins can remove members.

Before removal, the Admin can choose whether to:
- Remove the user immediately.
- Transfer the user's assigned responsibilities before removal.

If responsibilities are not reassigned:
- Open tasks remain in the group.
- Tasks are marked as unassigned.
- Historical activity remains available.
- The removed user immediately loses access to that group.
- Their membership in other groups is unaffected.

## 4.6 Leaving a Group

Users can leave groups independently.

Before leaving:
- The system checks for assigned open tasks and treatments.
- Users can transfer responsibilities or leave items unassigned.
- The last Admin must appoint another Admin before leaving.

## 4.7 Group Deletion

Only an Admin can delete a group.

Deletion requires explicit confirmation.

The process:
1. The group becomes inactive and hidden.
2. A 30-day recovery period begins.
3. During this period, the group can be restored.
4. After 30 days, the group and associated data and files are permanently deleted, subject to the backup-retention policy.

## 4.8 Account Deletion

Users can request account deletion.

The account is deactivated and a 30-day recovery period begins. The user can cancel deletion during this period.

Before permanent deletion, the system checks for outstanding responsibilities:
- Active responsibilities must be transferred or resolved.
- If the user is the last Admin of a group, another Admin must be appointed.

After 30 days, personal account information is permanently deleted according to the data-retention policy.

Group activity history required for continued management should be retained without unnecessary personal identification, where appropriate.

---

# 5. Pet Profile Management

## 5.1 Supported Animal Types

The application must support all animal species.

The data model must not be limited to dogs and cats.

Common species should be supported initially, with a flexible extension mechanism for additional animal types.

## 5.2 Basic Pet Information

Each pet profile includes:
- Name.
- Profile photo.
- Species / animal type.
- Breed.
- Sex.
- Date of birth or estimated age.
- Weight.
- Color.
- Identifying characteristics.

No fixed medical fields for allergies, chronic conditions, or microchip information are required in the initial profile.

Medical information belongs in the medical-history module.

## 5.3 Fixed Contact Information

Each pet has a dedicated details section containing:

**Regular veterinarian**
- Name.
- Clinic.
- Phone number.
- Address.

**Pet insurance**
- Insurance provider.
- Policy number.
- Expiration date.
- Contact information.

## 5.4 Permissions

Only Admins can create, edit, or delete pet profiles.

Caregivers have view-only access.

---

# 6. Medical History and Treatments

## 6.1 Medical History

The application provides a flexible chronological medical history.

Each medical event is stored as a separate record.

Supported event types include:
- Vaccination.
- Deworming.
- Veterinary examination.
- Treatment.
- Medication.
- Surgery.
- Diagnosis.
- Laboratory test.
- Other medical events.

Each record can contain:
- Event type.
- Date.
- Title.
- Description.
- Veterinarian or healthcare provider.
- Notes.
- Attachments.
- Optional event-specific information, such as dosage or laboratory results.

Users can browse medical history chronologically.

## 6.2 Medical Documentation

Both Admins and Caregivers can:
- View medical records.
- Add new medical records.
- Upload medical documents.
- Upload photos.

Only Admins can edit or delete existing records.

## 6.3 Medication and Repeated Treatment Management

Admins can create medication plans containing:
- Medication or treatment name.
- Dosage.
- Instructions.
- Frequency.
- Start date.
- End date.
- Responsible caregiver.
- Reminder recipients.
- Optional notes.

Supported frequencies include daily, multiple times per day, weekly, selected days of the week, and other configurable recurring schedules.

## 6.4 Medication Administration Tracking

Both Admins and Caregivers can mark a scheduled dose as administered.

The system distinguishes between:
- A scheduled medication dose.
- A dose that was actually administered.

Each administration record includes:
- Medication plan.
- Scheduled dose.
- Actual administration date and time.
- User who administered it.
- Optional notes.

The system maintains a complete administration history and identifies missed or unconfirmed doses.

## 6.5 Medication Inventory

Medication plans may be associated with inventory items.

The system supports:
- Tracking available medication quantity.
- Updating remaining quantities.
- Low-stock notifications.
- Reorder reminders.
- Prescription-related reminders where relevant.

## 6.6 Medical Safety Requirements

The application is a tracking and coordination tool, not a veterinary decision-support system.

It must never:
- Recommend medication dosages.
- Change veterinarian-prescribed instructions automatically.
- Generate medical diagnoses.
- Present operational insights as veterinary advice.

Medication instructions must originate from the user or veterinarian.

---

# 7. Appointments and Events

## 7.1 Overview

The application includes a manual calendar and event-management system.

It is not a veterinary booking marketplace.

No external clinic availability search or booking integration is required in the MVP.

## 7.2 Event Types

Examples:
- Veterinary appointment.
- Grooming.
- Boarding.
- Pet sitter.
- Medical treatment.
- Laboratory test.
- Birthday.
- Personal event.
- Other recurring or one-time events.

## 7.3 Event Information

Each event may include:
- Event type.
- Associated pet.
- Date and time.
- Location.
- Provider details.
- Description.
- Notes.
- Assigned responsible person.
- Participants.
- Notification recipients.
- Reminder settings.
- Recurrence settings.

## 7.4 Event Actions

Both roles can view events, create new events, mark events as completed, and cancel events.

Only Admins can edit or delete existing events.

Recurring events must be supported.

---

# 8. Food and Inventory Management

## 8.1 Overview

The inventory module tracks food, medication, and other pet-related products.

The system helps users understand what is available and when supplies may run out.

## 8.2 Product Information

Each inventory item may contain:
- Product name.
- Brand.
- Product type.
- Associated pet.
- Package size or purchased quantity.
- Current quantity.
- Purchase date.
- Estimated consumption rate.
- Vendor or store.
- Purchase price.
- Optional reorder threshold.

## 8.3 Inventory Operations

Both Admins and Caregivers can view inventory, update quantities, record consumption, and mark items as depleted.

Only Admins can add new products, edit product details, and delete products.

## 8.4 Smart Inventory Features

The application calculates an estimated depletion date using current quantity and estimated consumption rate.

Users can:
- Set low-stock thresholds.
- Receive low-stock notifications.
- Receive reorder reminders.
- Update inventory after a purchase.

Manual quantity updates must always be possible.

The system maintains purchase and consumption history.

---

# 9. Orders and Purchases

## 9.1 Overview

The application supports tracking purchases made outside the platform.

It does not include an internal ecommerce system.

## 9.2 Order Information

Each order may contain:
- Store or vendor.
- Store or product link.
- Order date.
- Estimated delivery date.
- Price.
- Quantity.
- Associated pet.
- Order status.
- Notes.

## 9.3 Order Statuses

- Ordered.
- Processing.
- Shipped.
- Delivered.
- Cancelled.

## 9.4 Order Operations

Both roles can view orders, create new orders, and update order status.

Only Admins can edit existing order details and delete orders.

When an order is marked as delivered, the user should be able to update the associated inventory item.

External store integrations are not required for the MVP.

## 9.5 Financial Scope

The application is not an expense-management or budgeting platform.

No dedicated expense tracking, financial reports, or budgeting functionality should be developed.

Purchase prices may be stored as part of product and order information.

---

# 10. Task Management

## 10.1 Overview

Tasks are actionable responsibilities related to pet care.

Tasks are separate entities from appointments, events, and notifications.

## 10.2 Task Information

Each task may contain:
- Title.
- Description.
- Associated pet.
- One or more assigned users.
- Due date and time.
- Priority.
- Status.
- Comments.
- Creation date.
- Completion history.
- Recurrence settings.

## 10.3 Task Statuses

- New.
- In progress.
- Completed.
- Overdue.
- Cancelled.

Overdue may be calculated based on due date and task status.

## 10.4 Task Operations

Both Admins and Caregivers can view all group tasks, create tasks, complete tasks, and request responsibility transfer.

Only Admins can edit existing tasks, change assignees, deadlines, and priorities.

A Caregiver's responsibility-transfer request requires Admin approval.

## 10.5 Recurring Tasks

The system supports one-time tasks, recurring tasks, completion history, and upcoming or overdue reminders.

## 10.6 Automatic Task Creation

The system can generate tasks based on other modules.

Examples:
- A medication plan generates scheduled dose tasks.
- An appointment can generate preparation or follow-up tasks.
- Low inventory can generate a reorder task.

Automatic task creation must not create unnecessary duplicates.

---

# 11. Routine and Activity Tracking

## 11.1 Overview

The routine module allows users to define and track recurring care activities.

Examples include walks, playtime, training, grooming, feeding-related activities, and other recurring activities.

## 11.2 Routine Definition

Admins can define a fixed routine for each pet.

A routine activity may contain:
- Activity name.
- Description.
- Frequency.
- Scheduled times.
- Selected days of the week.
- Assigned responsible person.
- Reminder recipients.

## 11.3 Activity Tracking

Both Admins and Caregivers can view routines, log completed activities, mark activities as completed, report missed activities, and add new activity records.

Only Admins can modify fixed routines, frequencies, and recurring schedules.

## 11.4 History

The system maintains completed activity history, missed activity history, responsible user, and completion date and time.

Advanced routine analytics are not required in the MVP.

---

# 12. Notifications and Reminders

## 12.1 Notification Categories

Users can individually enable or disable:
1. Medications and treatments.
2. Appointments and events.
3. Tasks.
4. Inventory and products.
5. Routine and activities.

Notification preferences are personal and do not affect other group members.

## 12.2 Notification Recipients

When creating a reminder, the creator selects recipients:
- One specific user.
- Multiple selected users.
- All group members.

A recipient receives the notification only if the relevant category is enabled in their personal preferences.

## 12.3 Push Notifications

Push notifications are supported on smartphones where the operating system and browser support them.

The application should be implemented as a PWA.

Push notifications require user permission. iOS generally requires the PWA to be installed on the home screen. Support depends on browser and operating-system capabilities.

The application must still display reminders and notification history inside the website when push notifications are unavailable.

## 12.4 Notification Actions

Users can:
- Open the related task or event.
- Mark a task as completed from a notification.
- Snooze or reschedule a notification.

Snooze options may include 15 minutes, 1 hour, tomorrow, or a custom date and time.

## 12.5 Snoozing vs. Changing a Schedule

Snoozing creates a new reminder without modifying the underlying task or treatment schedule.

For medication reminders, snoozing must never change veterinarian-prescribed instructions.

Shared task updates must synchronize across users and prevent unnecessary duplicate notifications.

---

# 13. Operational Insights

## 13.1 Overview

The application includes a basic operational insights module.

No AI integration is required in the MVP.

Insights are generated using predefined rules and existing application data.

## 13.2 Supported Insights

**Tasks**
- Overdue tasks.
- Incomplete tasks.
- Repeatedly recurring incomplete tasks.

**Inventory**
- Low-stock products.
- Products estimated to run out soon.

**Medical**
- Upcoming medication doses.
- Upcoming treatments.
- Upcoming vaccinations based on entered schedules.

**Appointments**
- Upcoming appointments and events.

**Routine**
- Activities that were not completed or logged according to their schedule.

## 13.3 Insight Organization

Insights are grouped by pet/group, filterable, and relevant to the current user's permissions.

The system must not generate medical diagnoses or health recommendations.

## 13.4 Future AI Support

The architecture should allow future integration with AI services without requiring a major redesign.

No AI-generated insights, external AI API, paid AI service dependency, or AI-based medical recommendations are required in the MVP.

---

# 14. Global Search and Filtering

## 14.1 Overview

The application provides global search across accessible application data.

## 14.2 Searchable Information

Users can search across:
- Pet names.
- Tasks.
- Appointments and events.
- Medical records.
- Medications.
- Products.
- Orders.

## 14.3 Advanced Filters

Search results support filtering by:
- Group/pet.
- Date.
- Status.
- Assigned user.
- Information type.

## 14.4 Access Control

Search results must respect the user's group membership and role permissions.

The search system must never reveal data from groups the user cannot access.

---

# 15. Home Dashboard

## 15.1 Overview

The dashboard provides a unified view of the user's pet-care responsibilities.

## 15.2 Group Overview

The dashboard displays:
- Accessible pets/groups.
- Open tasks.
- Overdue tasks.
- Upcoming appointments.
- Upcoming treatments.
- Low inventory alerts.

## 15.3 Personal Overview

The dashboard also displays:
- Tasks assigned to the current user.
- Activities scheduled for today.
- Medications and treatments for which the user is responsible.
- Reminders directed to the user.

## 15.4 Navigation

The dashboard provides quick navigation to:
- Pet profiles.
- Medical history.
- Calendar.
- Tasks.
- Inventory.
- Orders.
- Routine tracking.

Dashboard content must respect user permissions and notification preferences.

---

# 16. Localization and Internationalization

## 16.1 Supported Languages

The first release supports Hebrew and English.

Hebrew is the default language.

Users can independently select their preferred language.

Changing one user's language must not affect other users.

## 16.2 Layout Direction

The interface supports:
- RTL for Hebrew.
- LTR for English.

The layout must adapt correctly, including navigation, forms, tables, icons, dates, text alignment, and notifications.

## 16.3 Regional Settings

Initial defaults:
- Country: Israel.
- Currency: NIS.
- Israeli date and time formats.
- Appropriate local time-zone handling.

The architecture should support additional locales and currencies in the future.

---

# 17. Design and User Experience

## 17.1 Design Direction

The visual direction combines:
- Modern and minimal design.
- Warm and friendly elements.
- Clear information hierarchy.
- Functional management-oriented components.

The application should feel approachable to everyday pet owners while remaining efficient for managing multiple responsibilities.

## 17.2 Animal-Specific Visual Elements

The visual design adapts to the selected pet species.

Examples:
- Dogs: dog-related icons and illustrations.
- Cats: cat-related visual elements.
- Birds: bird-related illustrations.
- Rabbits: rabbit-related elements.
- Reptiles: reptile-related elements.

For less common species, use a suitable generic animal visual style.

These elements must not reduce readability, usability, or accessibility.

## 17.3 Responsive Design

The interface must work across desktop, tablet, and mobile devices.

The mobile experience should be optimized for quick daily actions such as marking medication as administered, completing tasks, logging activities, updating inventory, and checking upcoming events.

---

# 18. Accessibility Requirements

## 18.1 Accessibility Objective

Accessibility is a core product requirement.

The application must be designed and developed to conform to **WCAG 2.2 Level AA**, including applicable criteria for web content and interactive application functionality.

Accessibility must be considered throughout design, development, and testing. It must not be treated as a final visual enhancement.

The application should support users with:
- Visual disabilities.
- Blindness or low vision.
- Color vision deficiencies.
- Hearing disabilities.
- Motor and mobility disabilities.
- Cognitive and learning disabilities.
- Temporary or situational accessibility needs.

A third-party accessibility toolbar alone does not establish WCAG compliance.

## 18.2 Perceivable Content

The application must:
- Provide meaningful alternative text for informative images.
- Use empty alternative text for purely decorative images.
- Ensure sufficient text and interface-component contrast.
- Never use color as the only way to communicate status or information.
- Provide visible labels and instructions for form fields.
- Support browser zoom and text resizing without loss of content or functionality.
- Avoid unnecessary text embedded inside images.
- Provide accessible names for icons and icon-only buttons.
- Use captions or transcripts when relevant audio or video content is introduced.
- Ensure that important notifications are available in a readable text format.

Target minimum contrast ratios:
- Normal text: 4.5:1.
- Large text: 3:1.
- Essential UI components and graphical objects: 3:1 against adjacent colors.

## 18.3 Operable Interface

The application must:
- Support complete keyboard navigation.
- Avoid keyboard traps.
- Provide visible keyboard focus indicators.
- Use a logical and predictable focus order.
- Provide a skip-to-main-content link.
- Use accessible menus, dialogs, dropdowns, calendars, and date pickers.
- Allow sufficient time to complete actions.
- Avoid content that flashes in a way that may trigger seizures.
- Provide accessible alternatives to drag-and-drop interactions.
- Support appropriate touch target sizes, following WCAG 2.2 requirements.
- Ensure that sticky elements and overlays do not obscure keyboard focus.

All essential functions must be available without requiring a mouse.

## 18.4 Understandable Interface

The application must:
- Use clear and consistent navigation.
- Maintain consistent terminology across modules.
- Provide descriptive headings and labels.
- Display understandable validation messages.
- Identify errors in text and explain how to correct them.
- Avoid unexpected context changes when users interact with controls.
- Use clear confirmation messages for important actions.
- Warn users before destructive actions such as deleting a group or removing important records.
- Provide accessible instructions for complex forms and recurring schedules.

## 18.5 Robustness and Assistive Technology Support

The application must:
- Use semantic HTML elements.
- Provide correct accessible names, roles, states, and values.
- Support screen readers.
- Support common assistive technologies.
- Use ARIA only when native HTML semantics are insufficient.
- Announce relevant dynamic updates to screen readers.
- Ensure modal dialogs manage keyboard focus correctly.
- Ensure form errors and status messages are programmatically associated with relevant fields.
- Avoid inaccessible custom UI components.

The implementation should be tested with common screen readers and keyboard-only navigation.

## 18.6 Accessible Forms and Data Tables

Forms must:
- Have visible and programmatically associated labels.
- Indicate required fields clearly.
- Explain validation errors.
- Preserve entered information when validation fails.
- Provide accessible success and failure feedback.

Tables must:
- Use semantic table markup.
- Include meaningful column headers.
- Provide accessible labels or captions where appropriate.
- Remain usable on smaller screens without losing essential information.

## 18.7 Accessible Charts and Visual Insights

Charts and visual indicators must not rely exclusively on color.

Where charts are used:
- Provide a textual summary or equivalent data representation.
- Use accessible labels.
- Ensure that key values are available to screen readers.
- Provide a table or text-based alternative when needed.

## 18.8 Reduced Motion

The application should respect the operating system's reduced-motion preference.

Animations and transitions should:
- Be limited to what is useful.
- Avoid unnecessary movement.
- Not be essential for understanding information.
- Be reducible or disabled when appropriate.

## 18.9 RTL and Accessibility

Hebrew RTL support must not compromise accessibility.

The application must ensure:
- Correct reading order.
- Logical keyboard navigation.
- Correct screen-reader reading sequence.
- Appropriate alignment and positioning.
- Proper handling of mixed Hebrew and English content.
- Correct display of dates, numbers, phone numbers, and email addresses.

## 18.10 Accessibility Testing

Accessibility must be tested throughout development.

Testing should include:
- Automated accessibility checks.
- Manual keyboard-only testing.
- Screen-reader testing.
- Browser zoom and text-resizing tests.
- Contrast testing.
- Mobile accessibility testing.
- Testing of forms, modals, calendars, navigation, tables, and dynamic notifications.

Automated accessibility tools are useful but do not replace manual testing.

Critical accessibility issues must be resolved before a feature is considered complete.

---

# 19. Accessibility Toolbar

## 19.1 Overview

The application must include a visible accessibility toolbar that allows users to adjust selected presentation settings.

The toolbar should be available throughout the application.

It must be accessible using:
- Mouse.
- Keyboard.
- Screen readers.
- Touch devices.

The toolbar itself must comply with the application's accessibility requirements.

## 19.2 Suggested Toolbar Features

The toolbar should provide the following controls where technically appropriate:

1. Increase text size.
2. Decrease text size.
3. Reset text size.
4. High-contrast display mode.
5. Alternative contrast themes, where useful.
6. Underline links.
7. Highlight keyboard focus.
8. Reduce or disable animations.
9. Reset accessibility settings.
10. Link to the accessibility statement.

Controls must have clear labels and accessible names.

## 19.3 User Preferences

Accessibility settings should:
- Be independently configurable by each user.
- Persist between sessions where possible.
- Be resettable to default settings.
- Avoid changing another user's preferences.
- Work consistently across the main application modules.

The application should also respect relevant operating-system and browser accessibility preferences.

## 19.4 Toolbar Limitations

The toolbar is an additional convenience feature.

It must not be used as a substitute for:
- Correct semantic HTML.
- Sufficient default contrast.
- Keyboard accessibility.
- Screen-reader support.
- Accessible forms.
- Accessible navigation.
- WCAG-compliant implementation.

The default application experience must already meet the intended accessibility standard without requiring users to activate the toolbar.

---

# 20. Accessibility Statement

## 20.1 Overview

The application must include a dedicated Accessibility Statement page.

The page must be accessible from:
- The main navigation or application footer.
- The accessibility toolbar.
- Other appropriate help or information sections.

## 20.2 Accessibility Statement Content

The statement should include:

**Accessibility commitment**

Pet Care Hub is committed to providing an accessible and usable digital experience for all users, including people with disabilities.

**Accessibility standard**

The application is designed and developed with the goal of conforming to WCAG 2.2 Level AA.

**Supported accessibility features**

The statement should describe the accessibility features actually implemented, including:
- Keyboard navigation.
- Screen-reader support.
- Text resizing.
- Contrast and visual adjustments.
- Responsive design.
- Accessible forms and controls.

Only features that have actually been implemented and tested may be claimed.

**Known accessibility limitations**

Any known accessibility issues or limitations should be described honestly.

**Feedback and accessibility support**

Users should be able to report accessibility problems or request assistance through the application's contact form.

The accessibility contact process should be clear and easy to find.

**Last updated**

The page must display its last review or update date.

## 20.3 Legal and Regulatory Considerations

The accessibility statement and implementation should be reviewed against applicable Israeli accessibility requirements and regulations before public launch.

The exact legal obligations, required statement wording, and any applicable exemption or contact details must be verified by a qualified accessibility professional or legal advisor.

The application must not claim legal compliance or certification without appropriate verification.

## 20.4 Accessibility Statement Maintenance

The statement must be updated when:
- New accessibility features are introduced.
- Existing functionality changes.
- Accessibility testing identifies new limitations.
- Previously reported issues are resolved.

---

# 21. Technical and Architectural Requirements

## 21.1 Application Architecture

The application should use a modular architecture.

Suggested modules:
- Authentication and users.
- Groups and memberships.
- Pet profiles.
- Medical records.
- Medication plans and administration.
- Appointments and events.
- Tasks.
- Inventory.
- Orders.
- Routine tracking.
- Notifications.
- Insights.
- Search.
- Accessibility preferences and statement.

Modules should be designed to support future expansion.

## 21.2 Database Architecture

The database must support relational connections between users, groups, pets, and care-related records.

Important relationships:
- One group has exactly one pet.
- One pet belongs to exactly one group.
- One user can belong to multiple groups.
- One group can contain multiple users.
- Each group membership has one role.
- Each group contains its own medical records, tasks, events, inventory, orders, routines, and reminders.

All group-related entities must contain a reliable group association.

Data access must be validated using authenticated user membership and permissions.

## 21.3 Suggested Core Data Entities

| Entity | Purpose |
|---|---|
| User | User account and personal settings |
| Group | Pet-care group |
| GroupMembership | User membership and role |
| Invitation | Group invitations and invitation links |
| Pet | Pet profile |
| PetDetails | Veterinarian and insurance information |
| MedicalRecord | Medical history entries |
| MedicationPlan | Medication and treatment schedules |
| MedicationAdministration | Actual dose administration records |
| Appointment | Appointments and events |
| Task | Tasks and responsibilities |
| TaskHistory | Task activity and completion history |
| Product | Inventory product definitions |
| InventoryRecord | Quantity updates and consumption history |
| Order | External purchases and delivery tracking |
| Routine | Fixed recurring care schedules |
| ActivityLog | Completed or missed activities |
| Notification | Notification and reminder records |
| NotificationPreference | Individual notification settings |
| Attachment | Uploaded files and photos |
| Insight | Operational insight records, if persistence is needed |
| AccessibilityPreference | Individual accessibility settings |

The implementation should avoid unnecessary duplication of data.

Medication schedules and actual medication administration records must remain separate.

## 21.4 File Storage

The application supports secure storage of:
- Pet profile photos.
- Medical documents.
- Medical photos.
- Support-form attachments.

Files must be associated with the relevant group and protected by the same access-control rules as associated records.

## 21.5 Background Jobs

The architecture should support scheduled background processes for:
- Medication reminders.
- Appointment reminders.
- Task reminders.
- Recurring task generation.
- Routine reminders.
- Inventory threshold checks.
- Operational insight generation.
- Invitation expiration.
- Account and group deletion workflows.

Background jobs must be idempotent where possible.

## 21.6 Auditability

Important actions should be traceable, including medication administration, task completion, user invitations and removals, role changes, medical record creation, and changes to treatment schedules.

The system should record relevant timestamps and responsible users.

---

# 22. Security and Privacy

## 22.1 Access Control

Access is determined by:
1. Group membership.
2. Role within that group.
3. Module-specific permissions.

Users must only access information belonging to groups in which they are members.

## 22.2 Authentication Security

The application should implement:
- Secure authentication.
- Password hashing when passwords are stored locally.
- Secure session management.
- Protected authentication flows.
- Appropriate account recovery mechanisms.

## 22.3 Data Protection

The system should include:
- HTTPS.
- Secure database access.
- Secure file storage.
- Server-side authorization.
- Protection against unauthorized data access.
- Secure handling of invitation links.
- Appropriate logging and monitoring.

## 22.4 Backups and Recovery

Automatic server-side backups are required.

Backups must include database information and uploaded documents and files.

Requirements:
- Periodic automated backups.
- Secure storage separate from the active database.
- Defined retention policy.
- Recovery procedures.
- Protection against unauthorized access.

Backup retention must be coordinated with permanent deletion policies.

## 22.5 Data Export

Data export is not included in the MVP.

Users cannot download PDF reports, Excel reports, or complete group data exports.

This functionality may be considered in future versions.

---

# 23. Support and Feedback

The MVP includes a basic contact and feedback form.

Users can submit:
- Bug reports.
- Questions.
- Feature suggestions.
- Accessibility issues.

The form contains:
- Request type.
- Subject.
- Free-text description.
- Optional screenshot or file attachment.

The system automatically associates the request with the user's account.

The form must be accessible and usable with keyboard navigation and screen readers.

A full support-ticket management system and in-app conversation history are not required.

---

# 24. Product Scope and Development Roadmap

The product should be developed incrementally.

The architecture should support the complete product vision, while implementation should be divided into manageable phases.

## Phase 1 – Core Foundation

**Goal:** Establish the basic application structure and user-management system.

Features:
- Authentication.
- User profiles.
- Hebrew and English support.
- Groups.
- Group memberships.
- Admin and Caregiver roles.
- Invitation system.
- Pet profile creation and editing.
- Veterinarian and insurance details.
- Group-based access control.
- Basic responsive dashboard.
- Accessible design system and reusable UI components.
- Semantic HTML and keyboard navigation.
- Initial accessibility toolbar.
- Accessibility statement page.

**Acceptance criteria:**
- A user can register and log in.
- A user can create a group and pet.
- The creator becomes the first Admin.
- An Admin can invite another user.
- A user can belong to multiple groups.
- A user can have different roles in different groups.
- Users cannot access groups they do not belong to.
- The interface supports Hebrew RTL and English LTR.
- Core navigation and forms are usable with a keyboard.
- Accessibility preferences work independently per user.
- The accessibility statement page is available.
- Initial accessibility testing has been completed.

## Phase 2 – Daily Pet Care

**Goal:** Enable users to manage the main responsibilities involved in pet care.

Features:
- Medical history.
- Medical documentation uploads.
- Medication plans.
- Medication administration tracking.
- Appointments and events.
- Calendar.
- Task management.
- Basic reminders.

**Acceptance criteria:**
- Users can view medical history according to permissions.
- Caregivers can add medical documentation.
- Only Admins can edit medication plans.
- Both roles can record actual medication administration.
- Scheduled doses are distinguishable from administered doses.
- Users can create and complete tasks.
- Users can create appointments and events.
- Permissions are enforced on the backend.
- New forms, calendars, and dialogs are accessible.

## Phase 3 – Inventory and Routines

**Goal:** Expand the application to cover ongoing care management.

Features:
- Food and product inventory.
- Quantity tracking.
- Consumption history.
- Low-stock alerts.
- Orders and purchases.
- Delivery status tracking.
- Recurring routines.
- Activity logs.

**Acceptance criteria:**
- Users can update inventory quantities.
- The application can estimate when inventory will run out.
- Users can create and update orders according to permissions.
- Users can define and track recurring activities.
- Completed and missed activities are recorded.
- Inventory and routine interfaces are accessible.

## Phase 4 – Advanced Coordination

**Goal:** Improve coordination and provide a complete overview of responsibilities.

Features:
- Advanced push notifications.
- Personal notification preferences.
- Recipient selection.
- Notification snoozing.
- Automatic task creation.
- Global search.
- Advanced filtering.
- Operational insights.
- Improved dashboard.

**Acceptance criteria:**
- Notifications respect personal preferences.
- Reminders can be directed to selected group members.
- Snoozing does not modify the underlying task or medication schedule.
- Global search respects group permissions.
- Operational insights use predefined rules.
- Automatic task generation does not create unnecessary duplicates.
- Dynamic updates and notifications are accessible to assistive technologies.

## Phase 5 – Future Expansion

Potential future features:
- AI-powered insights.
- Veterinary integrations.
- External store integrations.
- Data export.
- Additional languages and currencies.
- Advanced analytics.
- More sophisticated reporting.

These features are not part of the MVP.

---

# 25. Global Non-Functional Requirements

**Usability**
- Simple navigation.
- Clear feedback after user actions.
- Consistent interface across modules.
- Minimal unnecessary complexity.

**Accessibility**
- Target WCAG 2.2 Level AA.
- Keyboard accessibility.
- Screen-reader compatibility.
- Sufficient contrast.
- Accessible forms and controls.
- Responsive text resizing.
- Accessible dynamic content.
- Accessibility statement and toolbar.

**Performance**
- Responsive interface.
- Efficient database queries.
- Appropriate pagination.
- Efficient search and filtering.

**Reliability**
- Reliable data persistence.
- Error handling.
- Background-job monitoring.
- Backup and recovery capabilities.

**Security**
- Backend authorization.
- Group-level data isolation.
- Secure authentication.
- Protected file storage.

**Maintainability**
- Modular code structure.
- Reusable components.
- Clear separation between frontend and backend.
- Documented APIs and data models.
- Automated tests for critical business logic.

**Scalability**
- Support for users with multiple groups.
- Support for multiple pets across separate groups.
- Support for additional animal species.
- Support for future AI and third-party integrations.

---

# 26. Important Business Rules

The following rules are core system constraints:

1. Every group represents exactly one pet.
2. Every pet belongs to exactly one group.
3. A user can belong to multiple groups.
4. Membership is separate for each group.
5. There are no roles: all members of a group have the same rights.
6. Any member can manage group members.
7. Any member can edit the pet profile.
8. Any member can add, edit and delete medical documentation.
9. Any member can mark medication as administered.
10. Medication administration must never be inferred from a notification.
11. The application must not recommend or change veterinary dosages.
12. Snoozing a reminder must not change the underlying schedule.
13. Group data must remain isolated.
14. Search results must respect group membership and permissions.
15. A group cannot lose its last member (it can be deleted instead).
16. Removing a user from one group must not affect their other groups.
17. No AI functionality is required in the MVP.
18. No expense-management or budgeting module is required.
19. No in-app ecommerce or veterinary booking system is required.
20. Data export is not included in the MVP.
21. Accessibility is a core product requirement, not an optional enhancement.
22. The application must target WCAG 2.2 Level AA.
23. The accessibility toolbar does not replace accessible implementation.
24. The accessibility statement must accurately describe implemented and tested features.
25. Accessibility must be tested throughout development.

---

# 27. Development Guidelines for Claude Code

The PRD is the primary product requirements reference for development.

## 27.1 Before Implementation

- Review the existing repository and its architecture.
- Identify the current framework, dependencies, and project structure.
- Do not replace existing infrastructure without a clear reason.
- Translate the PRD into a technical implementation plan.
- Identify dependencies between modules.
- Propose the database schema before implementing complex features.
- Identify unresolved technical decisions instead of silently inventing product requirements.
- Review the accessibility requirements and establish an accessibility implementation and testing plan before building UI components.

## 27.2 Implementation Principles

- Build incrementally, following the development phases.
- Do not implement all modules at once.
- Maintain separation between frontend and backend responsibilities.
- Enforce authorization on the backend.
- Use reusable UI components.
- Support RTL and LTR throughout the application.
- Keep business logic separate from presentation logic.
- Use clear naming conventions.
- Write maintainable and documented code.
- Use semantic HTML and accessible components by default.
- Avoid inaccessible custom controls.
- Ensure that every new feature follows the accessibility requirements.

## 27.3 Testing

Every major feature should include appropriate tests.

Priority test areas:
- Authentication.
- Group membership.
- Role-based permissions.
- Cross-group data isolation.
- Medication administration.
- Task assignment and completion.
- Recurring schedules.
- Notification recipient selection.
- Account and group deletion.
- File access permissions.
- Keyboard navigation.
- Screen-reader compatibility.
- Contrast.
- Form validation and error announcements.
- Responsive accessibility.
- Accessibility toolbar behavior.

Automated accessibility testing should be integrated into the development workflow where practical.

Automated tools must be supplemented with manual accessibility testing.

A feature should not be considered complete until its functional acceptance criteria and relevant accessibility criteria have been reviewed.

## 27.4 Development Workflow

For each development phase:
1. Review the relevant PRD requirements.
2. Define the implementation tasks.
3. Identify affected database entities and APIs.
4. Implement the feature.
5. Add or update tests.
6. Verify permissions and edge cases.
7. Perform relevant accessibility checks.
8. Update technical documentation.
9. Confirm acceptance criteria before moving forward.

Do not begin a new development phase before the previous phase has been reviewed and its acceptance criteria have been checked.

---

# 28. Final Product Definition

Pet Care Hub is a multi-user, multi-group pet-care management platform.

Its core structure is based on one pet per group, with multiple users sharing responsibility for that pet.

The application combines:
- Pet profiles.
- Medical history.
- Medication tracking.
- Appointments.
- Task management.
- Inventory.
- Orders.
- Recurring routines.
- Notifications.
- Operational insights.
- Global search.
- Accessibility features.

The product should prioritize reliability, ease of use, secure group-based collaboration, accessibility, and a clear user experience.

The first release should establish a stable foundation and deliver the core pet-care workflows. Additional capabilities should be introduced incrementally without compromising the architecture or requiring major redesigns.

Accessibility must be integrated into the product from the beginning, with WCAG 2.2 Level AA as the target standard.

**This document defines product requirements and intended behavior. Specific technology choices, infrastructure providers, database implementation details, deployment decisions, and formal accessibility compliance verification should be finalized during technical planning and before public launch.**