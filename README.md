# EduNexus AI – Smart Campus Analytics

EduNexus AI is a student-success and journey-intelligence application. It brings academic, attendance, engagement, LMS, placement, skills and feedback evidence into a staff-facing workspace so authorized users can review student progress and coordinate support.

**Repository:** https://github.com/ambatitharunsai-tech/EduNexusAI

> This repository is the Express/TypeScript application variant. It is distinct from [edunexus-ai](https://github.com/ambatitharunsai-tech/edunexus-ai), which contains a separate FastAPI backend. Follow this repository's Node.js setup instructions here.

## Product areas

- **Dashboard and analytics:** cohort overview, domain coverage and student-success signals.
- **Student directory and journey:** student search, profiles, evidence summaries, timelines and risk explanations.
- **Advisor and faculty workflows:** advisor queues, course views and faculty flags.
- **Interventions:** create and update support plans, capture follow-up information and record outcomes.
- **CSV workflows:** preview, validate and import supported datasets.
- **AI copilot:** optional Gemini-powered assistant endpoint.
- **Access controls:** role-aware API workflows for student, advisor, faculty and administrative experiences.

The project is intended for human-led student support. Risk indicators are decision-support signals, not diagnoses or definitive predictions. They must not be used to automatically penalize, discipline or exclude students.

## Technology

- React 19, TypeScript, Vite and Tailwind CSS
- Express 5 and Node.js
- Supabase client packages and SQL migration files
- Firebase client integration in the frontend
- Google Gemini API for the optional copilot
- Vitest and Testing Library

## Architecture and data notes

The Express API is implemented in the root `server.ts`. The frontend lives in `frontend/` and is served by the Express process in production; in development, the server connects to Vite's development middleware.

The current server code reads synthetic sample data from `data/synthetic_seed.json`. Treat this repository as a prototype/demo environment unless a separately configured persistent data store has been implemented and verified. Do not enter real student records or production credentials into the demo seed files.

Supabase SQL migrations are retained under `supabase/migrations/`; review the migration guide before applying them to a project. The existence of migration files alone does not mean the running Express server is connected to a production Supabase database.

## Requirements

- Node.js 24 or a compatible current release with TypeScript support
- npm
- Supabase project configuration only for integrations enabled in your deployment
- A Gemini API key only when enabling the AI copilot

## Local development

Clone the repository and install dependencies:

```bash
git clone https://github.com/ambatitharunsai-tech/EduNexusAI.git
cd EduNexusAI
npm install
npm --prefix frontend install
```

Create a root `.env` from `.env.example` and configure only the integrations you have set up. The file lists the supported environment-variable names, including `PORT`, `JWT_SECRET`, `GEMINI_API_KEY`, Supabase values and API origin settings.

Start the application:

```bash
npm run dev
```

The Express server uses port `3000` by default. Set `PORT` to use another local port.

## Useful commands

| Command | Description |
|---|---|
| `npm run dev` | Start the Express API and Vite frontend in development |
| `npm run build` | Build the frontend |
| `npm run lint` | Run frontend lint checks |
| `npm test` | Run frontend tests |
| `npm start` | Start the production Express server |

Recommended checks before submitting changes:

```bash
npm run lint
npm test
npm run build
```

## API overview

The server exposes health routes, authentication and account-preference endpoints, dashboard and student endpoints, advisor/faculty workflows, intervention management, CSV preview/import routes, demo-data helpers and an AI copilot endpoint. The route implementations in `server.ts` are the source of truth for request/response details.

Health checks:
- `GET /health`
- `GET /api/v1/health`
- `GET /health/db`

## Environment and security

- Set a unique, long random `JWT_SECRET`; never rely on a development fallback.
- Keep `GEMINI_API_KEY` and any privileged Supabase key on the server only.
- Frontend variables prefixed with `VITE_` are public and must not contain secrets.
- Restrict API origins and enable HTTPS in production.
- Keep synthetic demo data separate from real student records.
- Review role checks, RLS policies and audit behavior before any institutional pilot.

## Database migrations

See [supabase/migrations/README.md](supabase/migrations/README.md) for the SQL migration sequence and security checklist.

## License

See the repository's license file, if one is present, for reuse terms.
