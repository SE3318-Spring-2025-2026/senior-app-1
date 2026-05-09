# Demo accounts

Every account below is created by `node backend/seed.js --reset` and shares the
same password to keep the demo simple.

**Password (all accounts):** `Demo1234!`

| Role        | Login field |        Identifier        | Display name                |
| ----------- | ----------- | :-----------------------: | --------------------------- |
| Admin       | email       |    `admin1@demo.edu`    | Admin One                   |
| Admin       | email       |    `admin2@demo.edu`    | Admin Two                   |
| Coordinator | email       | `coordinator1@demo.edu` | Coordinator One             |
| Coordinator | email       | `coordinator2@demo.edu` | Coordinator Two             |
| Professor   | email       |   `advisor1@demo.edu`   | Professor One               |
| Professor   | email       |   `advisor2@demo.edu`   | Professor Two               |
| Professor   | email       |  `committee1@demo.edu`  | Professor Three             |
| Professor   | email       |  `committee2@demo.edu`  | Professor Four              |
| Student     | student ID  |      `11070001000`      | Leader Leo (leads group 1)  |
| Student     | student ID  |      `11070001001`      | Leader Lina (leads group 2) |
| Student     | student ID  |      `11070001002`      | Student Sam                 |
| Student     | student ID  |      `11070001003`      | Student Sofia               |

Notes

- All four staff "Professor" accounts use the `PROFESSOR` role — there is no
  separate "advisor" or "committee member" role. A professor becomes an
  advisor when a `GroupAdvisorAssignment` row points at them, and they act on
  the committee when they grade a submission for a group they don't advise.
  The seed wires *Professor One* as advisor of *Demo Senior Project Group*
  and *Professor Two* as advisor of *Demo Project Group Two*; the other two
  professors have no advisor row so they always grade as committee members.
- Students log in with their 11-digit ID, not their email. The seeded emails
  on the `User` row are not used for the login form.
- *Leader Leo* and *Leader Lina* are the team leaders of the two demo groups;
  the other two students are members.
- For production, rotate the password and re-run the seed (or remove the demo
  accounts entirely).
