# senior-app-1


## 1. Project Requirements

## User Roles

### Student
Students register to the system and work in project groups. They submit project documents and participate in sprints.

### Team Leader
The student who creates a group becomes the team leader. The team leader can invite other students to the group.

### Advisor
Advisors are professors who supervise project groups and evaluate their work.

### Coordinator
The coordinator manages grading rules, schedules, and committee assignments.

### Admin
The admin manages the system and performs administrative operations.

---

## 2. Functional Requirements

* Students must be able to register to the system.
* Students must be able to log in to the system.
* Groups must be able to submit a **Proposal document**.
* Groups must be able to submit a **Statement of Work (SoW)**.
* The system must fetch **sprint issues** from JIRA.
* The system must check related **GitHub pull requests** for those issues.
* The coordinator can configure deliverables, grading rubrics, and evaluation criteria.
* The system supports both binary and soft grading schemes.
* The coordinator can assign committees and manage jury assignments.
* The coordinator can set per-sprint story point requirements for each student.
* The system supports markdown editing with WYSIWYG support and image insertion for deliverable documents.
* The system provides a password reset mechanism for admins, generating one-time-use reset links.
* The system allows professors to be manually registered by the admin, with a forced password change on first login.
* The system supports notification features for group invitations, advisor requests, and committee assignments.
* The coordinator can upload valid student IDs for registration eligibility.
* The coordinator can manually add or remove students from groups.
* The system supports daily refresh of JIRA issues and GitHub PRs for active sprints.
* The system provides live grade visibility for advisors during sprints.
* The system uses AI to read pull request comments and verify that a review process has happened (future feature).
* The system uses AI to validate issue implementation by reading file diffs in PRs and checking against the issue description (future feature).

---

## 3. Non-Functional Requirements

* The system must support at least 500 concurrent users without performance degradation.
* The system should respond to user actions within 2 seconds for 95% of requests.
* User data must be stored securely, and all sensitive operations (including login) must require two-factor authentication (2FA).
* The system should keep logs of all user activities, with logs retained for a minimum of 1 year and accessible only to authorized personnel.
* The system must have an uptime of at least 99.5% per month, excluding scheduled maintenance.
* The system must be accessible and usable on the latest versions of Chrome, Firefox, Safari, and Edge, and on both desktop and mobile devices.
* All user-facing pages must meet WCAG 2.1 AA accessibility standards.
* The system must support daily automated backups, with the ability to restore data within 4 hours in case of failure.
* All critical actions (e.g., grading, group changes, deliverable submissions) must be auditable, with a full history available to admins and coordinators.
* The system must be designed for maintainability, with modular code and clear documentation to allow onboarding of new developers within 2 weeks.
* Privacy: All personal data must comply with GDPR or equivalent privacy standards, including the right to data deletion and export.
* The system supports horizontal scaling to support increased user load during peak periods (e.g., submission deadlines).

---

## 5. Documentation & API Specifications

### Data Flow Diagrams (DFD)
- [Level 1 Overview](dfd_senior_project.drawio): High-level view of the entire system and its 6 core processes.
- [2.0 Group Formation](dfd_group_formation.drawio): Details student group creation, member invitations, and advisor requests.
- [3.0 Mentor Matching](dfd_mentor_matching.drawio): Details the lifecycle of advisor-group relationships, including transfers and releases.
- [4.0 Deliverable Management](dfd_deliverable_management.drawio): Covers rubric creation and deliverable submission/review.
- [5.0 Sprint Monitoring](dfd_sprint_monitoring.drawio): Shows integration with JIRA/GitHub and AI-assisted validation.
- [6.0 Final Evaluation](dfd_final_evaluation.drawio): Details the calculation of team and individual grade scalars.
- [User Registration](dfd_user_registiration.drawio): Details the student and professor onboarding process.

### API Specifications (OpenAPI 3.0)
- [Main API Specification](api_specification.yaml): The comprehensive API for all system modules.
- [Group Formation API](api_group_formation.yaml): Specialized endpoints for Process 2.0 (Group creation, invites, and advisor requests).
- [Mentor Matching API](api_mentor_matching.yaml): Specialized endpoints for Process 3.0 (Advisor management and coordinator actions).

---

## 4. Integration Requirements

* The system must support **GitHub OAuth** authentication for students to connect their GitHub accounts and fetch usernames for integration purposes.
* The system must integrate with **GitHub** to access pull requests, fetch branches, and verify PR merges.
* The system must integrate with **JIRA** to track sprint issues, story points, and fetch active stories in a sprint.
* The team leader must be able to connect the group with a **GitHub organization**.
* The team leader must be able to connect the group with a **JIRA workspace**.
* The team leader can set up and manage JIRA and GitHub integrations for their group.


## System Process Overview
| PROCESS | DESCRIPTION | SYSTEM COMPONENTS INVOLVED |
| :--- | :--- | :--- |
| User Registration | Students register via ID and link GitHub via OAuth. | Frontend, Auth Service (NextAuth.js), Database |
| Group Formation | Students create groups, invite members, and request advisors. | Frontend, Notification Service, Group DB |
| Mentor Matching | Managing "Advisee Requests" from team leaders to professors, including approval, release, or group transfer by the coordinator. | Team Leader, Advisor, Coordinator UI, Notification Service. |
| Deliverable Management | Coordinator sets rubrics; groups submit Proposal and SoW documents. | Frontend, Backend, Document Storage, Grading DB |
| Sprint Monitoring | System daily refreshes JIRA/GitHub data to track active stories and PRs. | JIRA/GitHub API Integrations, Backend, Sync Service |
| Final Evaluation | System applies scalars to deliverable grades based on individual contribution. | Backend (Logic Engine), Database, Advisor Panel |

---

## Detailed Workflow Steps

### 1. User Registration
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Student registers with ID | Frontend + Backend | Student ID (Pre-verified by Coordinator) |
| Student connects GitHub | Frontend + NextAuth.js | GitHub OAuth Tokens, Username |
| Admin registers as Professor | Admin Panel + Backend | Professor Name, Email |
| Professor changes password | Frontend + Backend | One-time reset link, New Password |

### 2. Group Formation
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Student creates a group | Frontend + Backend | Group Name, Team Leader ID |
| Leader invites members | Frontend + Notifications | Student IDs |
| Members approve/deny | Frontend + Notifications | Approval status |
| Leader requests Advisor | Frontend + Notifications | Professor ID |
| Advisor accepts request | Advisor Panel | Acceptance status |

### 3. Mentor Matching
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Team Leader makes Advisee Request | Frontend + Notifications | Selected Professor ID |
| Advisor receives notification | Advisor Panel + Notifications | Requesting Group details |
| Advisor approves/rejects request | Advisor Panel + Notifications | Approval/Rejection status |
| Advisor releases team | Advisor Panel + Notifications | Release confirmation for new requests |
| Coordinator transfers group | Coordinator Panel + Notifications | New Advisor ID |
| System performs sanitization | Backend | Groups without an advisor (disbanded) |

### 4. Deliverable Management
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Coordinator creates rubric | Frontend + Backend | Questions, Binary/Soft criteria |
| Coordinator sets weights | Frontend + Backend | Deliverable %, Sprint associations |
| Group submits Proposal/SoW | Markdown Editor | Text document, Images, Metadata |
| Committee reviews submission | Frontend + Backend | Comments, Grading picker |

### 5. Sprint Monitoring
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Team binds JIRA/GitHub | Frontend + Integration | JIRA Workspace, GitHub Org PAT |
| Daily refresh of stories | Backend + JIRA API | Issue Key, Work, Assignee, Points |
| Verify PR and merges | Backend + GitHub API | Issue Key, Branch name, PR status |
| AI validates implementation | AI Service + GitHub | File diffs, Issue description |

### 6. Final Evaluation
| PROCESS STEP | SYSTEM COMPONENT | DATA REQUIRED |
| :--- | :--- | :--- |
| Advisor grades Scrum/Review | Advisor Panel | Soft Grading letters (A, B, C...) |
| System calculates Team Scalar | Backend (Logic) | Avg of Scrum and Code Reviews |
| Track Individual points | Backend + JIRA | Completed vs Target story points |
| Apply final grade scalars | Backend + Database | Team grade, Individual ratio |
