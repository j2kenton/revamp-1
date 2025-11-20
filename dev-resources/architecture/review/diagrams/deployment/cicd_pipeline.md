# CI/CD Pipeline

```mermaid
graph TD
    A[Push to Git] --> B{CI Server}
    B --> C[Run Tests]
    C --> D{Build Application}
    D --> E[Deploy to Vercel]
```
