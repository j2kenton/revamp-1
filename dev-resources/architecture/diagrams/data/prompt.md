# Data Flow Diagram Prompt

You are a Fullstack Architect. Generate a **Mermaid Sequence Diagram** for the "Fetch User Profile" data flow.

**Context Files:**

1. `dev-resources\architecture\review\output.md`

**Task:**
Show the sequence of network requests and responses.

* The **Browser** (React Component) is the "Actor."
* The "Participants" are: **"Frontend Server (Next.js)"**, **"Backend API"**, and **"Database"**.
* The flow begins when the user's **Browser** hits the Next.js page.
* The **Frontend Server** makes an authenticated API call to the **Backend API**.
* The **Backend API** queries the **Database**.
* Show the response data flowing back through each participant to the **Browser**.
