# JULIETT Demo: UNA SRC App

> Authors: `@corbinehlendt` & `@carsonkerr`  
> SRC app: https://corbin-fullstack-brain-bucket.onrender.com/

## Demo Flow

1. User story and the problem (see india.md).
2. Runbook and show QR code.
3. Go to the app: have the class scan QR code and show the busy meter updating.
4. Open the AI assistant and enter a class schedule, show screenshots of it working.
5. Return to table and walk through specific code snippets.
6. Links to the issues and milestones.

## Demo Links

| What | Link |
|---|---|
| Product discovery (INDIA) | [docs/india.md](https://github.com/CorbinEhlendt/UNA-SRC-APP/blob/dev/docs/india.md) |
| QR code for check-in | [QR CODE](https://private-user-images.githubusercontent.com/194413130/696702115-1f802a7e-49af-43e3-96b0-20408d67a555.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3OTQyNzYwOTYsIm5iZiI6MTc5NDI3NTc5NiwicGF0aCI6Ii8xOTQ0MTMxMzAvNjk2NzAyMTE1LTFmODAyYTdlLTQ5YWYtNDNlMy05NmIwLTIwNDA4ZDY3YTU1NS5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYxMTEwJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MTExMFQwMTU2MzZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT0yYmJhOGE1NDVkZjhkODY2NGVlMjY5MmU3YTY0ZWYwMWM4MzE3YzlhMDRlNmNhMjI4ZTAzMDNkZDUxNDlmNjE4JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCZyZXNwb25zZS1jb250ZW50LXR5cGU9aW1hZ2UlMkZwbmcifQ.hHU2QVAjKF_9gp-ZDgYbgd8g6qwtcGdJRlL4IkhG1PQ) |
| Working AI examples (screenshots) | [Generated Plan](https://private-user-images.githubusercontent.com/167832137/696700292-ee9ff147-3577-4629-85e8-bb6656a6f5dd.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3OTQyNzYwOTYsIm5iZiI6MTc5NDI3NTc5NiwicGF0aCI6Ii8xNjc4MzIxMzcvNjk2NzAwMjkyLWVlOWZmMTQ3LTM1NzctNDYyOS04NWU4LWJiNjY1NmE2ZjVkZC5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYxMTEwJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MTExMFQwMTU2MzZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT1hNWE1ZTQ3OTE2ZTBmNGY0MzM5ODEwOTdmODg5MDMyMjg5NDdmYzAyMDE2OTI0MzQwNTRhZDU4Y2Q2Y2M3ZjI3JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCZyZXNwb25zZS1jb250ZW50LXR5cGU9aW1hZ2UlMkZwbmcifQ.PJ784rcfFA8CKPWCBrXO6NetI0qX79FmeMTsiJHS2wU) / [Chatbot](https://private-user-images.githubusercontent.com/167832137/696699183-a15c7bdf-1def-4353-90de-c58c32b6b7b9.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3OTQyNzYwOTYsIm5iZiI6MTc5NDI3NTc5NiwicGF0aCI6Ii8xNjc4MzIxMzcvNjk2Njk5MTgzLWExNWM3YmRmLTFkZWYtNDM1My05MGRlLWM1OGMzMmI2YjdiOS5wbmc_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYxMTEwJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MTExMFQwMTU2MzZaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT00ZDgzNDVlMzhhYjliM2Y5MWFjNmE3ZjZkN2IzMWZiYjRlYjg0M2QwZTFiYWYyMThjMjNmMDZkYjNjNDFjZDJlJlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCZyZXNwb25zZS1jb250ZW50LXR5cGU9aW1hZ2UlMkZwbmcifQ.9PcGryNb44TabIRXJ0ngMEaTimyxMfq9sDRigXB30gE) |
| Code: AI models and fallback | [server/mongo.js L142-L150](https://github.com/CorbinEhlendt/UNA-SRC-APP/blob/8a88bdb/server/mongo.js#L142-L150) |
| Code: AI instructions | [server/mongo.js L284](https://github.com/CorbinEhlendt/UNA-SRC-APP/blob/8a88bdb/server/mongo.js#L284) |
| Code: QR check-in GET route | [server/mongo.js L66-L103](https://github.com/CorbinEhlendt/UNA-SRC-APP/blob/8a88bdb/server/mongo.js#L66-L103) |
| Issues | [ISSUES](https://github.com/CorbinEhlendt/UNA-SRC-APP/issues) |
| Milestones | [MILESTONES](https://github.com/CorbinEhlendt/UNA-SRC-APP/milestones) |
