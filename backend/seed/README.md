# Seed JSON format

Run from `backend/` with `COMPVISTA_DEV_SEED=YES`:

```powershell
npm run seed:dev -- --input seed/demo.json
```

The input is one JSON object. See [demo.json](demo.json) for a complete example.

- `organization.name` is required. `organization.slug` is optional; when absent, the script derives one from the name. An existing slug must have the same name.
- `users` lists explicit login accounts. Every item needs `email`, `name`, and `role` (`admin`, `hr`, or `employee`). Exactly one explicit admin is required. Explicit employees get Employee profiles too.
- `generatedEmployees.count` is optional. It adds that many Employee accounts with stable `@yopmail.com` aliases. `emailPrefix` is optional; the default is `<organization-slug>.employee`. `namesFile` points to a JSON file with `first_names` and `last_names` arrays, such as `scripts/common_indian_names.json`. You can supply those arrays inline as `generatedEmployees.names` instead.
- `roles` is optional. Set `roles.admin`, `roles.hr`, or `roles.employee` to configure an editable `displayName` and a `permissions` object. Omitted roles and omitted permission flags use the defaults below. When explicit flags change in a plan, rerunning the seed updates that role's permissions row. When a role is omitted, an existing customized permissions row is left alone.

| Permission flag | Admin | HR | Employee |
| --- | --- | --- | --- |
| `canViewAllComp` | true | true | false |
| `canViewOwnComp` | true | true | true |
| `canProposeOthersComp` | true | true | false |
| `canProposeOwnComp` | true | false | false |
| `canApproveComp` | true | false | false |
| `canApproveOwnComp` | true | false | false |
| `requiresApproval` | false | true | true |

One `organization_role_permissions` row is created per role. A generated email keeps its sequence number across reruns, and its name is selected deterministically from the supplied lists. Existing passwords are never changed. Passwords are stored only in the ignored, access-restricted `backend/seed/generated/<organization-slug>/credentials.json` file. This command is for development only and does not expose an HTTP endpoint.

Pass `--reset-passwords` to replace existing seeded users? passwords with new random values. The organization credential file is updated after each reset; ordinary reruns preserve passwords.

## Compensation

Every organization gets the default component catalog (Basic, HRA, Special Allowance, Employer PF, Employee PF). Every seeded person, including the admin and HR users, gets an initial ACTIVE INR package effective 2026-04-01, created by the admin. Monthly Basic is chosen deterministically within the role band (admin 150,000–200,000; HR 60,000–90,000; employee 25,000–70,000). HRA is 40% of Basic, Special Allowance is 20–40% of Basic, and both PF items are 12% of Basic. People who already have applied compensation are skipped. The seed fails if any employee profile in the organization ends without an active package.

The employee role can only view its own compensation. `roles.employee.permissions` may not grant anything else, and the backend denies management endpoints to employees regardless of their permission row. Every signed-in member reads their own applied packages through `GET /me/compensation` (the **My compensation** page at `/app/my-compensation`).
