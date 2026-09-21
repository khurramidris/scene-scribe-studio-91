# Scene Weaver AI

Project: AI Microdrama Production Platform

You are acting as the principal software architect and senior full-stack engineering team for a commercial AI filmmaking SaaS.

Our objective is to build a real, production-oriented web application that allows users to turn story ideas into complete AI-generated drama episodes.

We are using Lovable as our initial development environment, but we will eventually continue development independently using our own source code and infrastructure.

Code ownership, portability, maintainability, and functional completeness are mandatory requirements.

1. Product overview

Build a professional AI filmmaking studio supporting the complete production lifecycle:

Story idea → Story development → Character creation → Screenplay → Scene breakdown → Storyboards → AI video generation → Shot approvals → Episode editing → Audio and subtitles → Final video export.

The platform must support both vertical 9:16 microdramas and horizontal 16:9 television episodes.

Users must be able to review and approve creative outputs at every stage, regenerate individual assets, edit individual scenes, and preserve previously approved work.

This is a real SaaS application, not a design prototype.

2. Architectural requirements

Use a conventional, maintainable, portable TypeScript and React application architecture.

Use a PostgreSQL-based database and a backend architecture that can operate independently from Lovable.

Prefer connecting a Supabase project owned by the developer rather than relying exclusively on proprietary managed services. If this is not possible in the current project configuration, clearly document the alternative and the migration requirements.

Implement secure authentication, user-specific data ownership, database access policies, file storage, backend functions, and environment-based configuration.

Separate the application into well-defined functional modules. Avoid creating a monolithic application where all business logic resides inside React components.

Use reusable service interfaces for AI integrations and other external dependencies.

Never expose third-party API keys or privileged database credentials in browser code.

3. Video generation architecture

Video generation must use a provider-independent interface.

The architecture must support multiple rendering providers, including:

Lovable's available video-generation services.

External commercial video-generation APIs.

A future self-hosted GPU rendering service using FastH3 or another compatible video model.

The application must not depend permanently on any single video-generation provider.

Implement request submission, job status tracking, result retrieval, failure handling, cancellation when supported, and regeneration.

Do not attempt to install or run GPU-intensive video models inside Lovable.

Where an external provider is not configured, use an explicitly identified development mock. Never represent a mock response as a real generation result.

4. Production data model

Design a persistent and extensible database covering users, projects, seasons, episodes, scenes, shots, characters, locations, scripts, storyboards, reference images, generated videos, audio assets, production jobs, approvals, subscriptions, credits, and usage records.

Include the relationships required to maintain character identity, script continuity, asset versions, and scene dependencies.

Approved creative assets must remain intact when other scenes or shots are regenerated.

5. Future independence

The application must be capable of being developed, built, tested, and deployed without the Lovable editor.

Maintain standard project configuration and reproducible database migrations.

Provide example environment configuration files without secrets.

Document all external services and dependencies.

Include instructions for local development, database setup, frontend deployment, backend deployment, and integration of external video-generation services.

Ensure the source code can be synchronized with GitHub.

6. Development methodology

We will implement this application incrementally.

Do not attempt to generate the entire platform in a single implementation task.

First, analyze the requirements and propose the complete architecture, database design, folder structure, functional modules, implementation sequence, dependencies, and testing strategy.

Identify which components can be fully implemented within Lovable and which require external infrastructure.

Then begin implementation with the application foundation, authentication, project management, and core database.

Every development phase must produce actual working software.

Do not create decorative controls that have no functionality or display fabricated production data as if it were real.

After each phase, report:

Functionality implemented.

Database changes and backend operations.

Tests executed and their results.

External dependencies and configuration requirements.

Unimplemented features and known limitations.

The next logical development task.

Preserve completed functionality when implementing subsequent phases.

Our priority is to maximize the amount of reusable, working source code produced before we stop using Lovable.

Begin with the architecture and implementation plan.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/917c4b28-5b60-4577-9b1d-a2bfec804f28).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
