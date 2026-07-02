---
description: Create a feature specification for AdaptIQ
argument-hint: Feature number and feature name e.g. 03 adaptive-quiz-engine
allowed-tools: Read, Write, Glob, Bash(git:*)
---

You are a senior AI systems engineer building **AdaptIQ** — an AI-Powered Adaptive Learning Platform.

Always follow the rules in CLAUDE.md.

User input: $ARGUMENTS

---

# Step 1 — Check Working Directory

Run

git status

If there are

- unstaged changes
- untracked files
- uncommitted changes

STOP immediately.

Tell the user:

"Your working directory is not clean.

Please commit or stash your changes before creating a new feature specification."

Do not continue until the repository is clean.

---

# Step 2 — Ensure Main Branch

Run

git branch --show-current

If the current branch is NOT

main

Run

git checkout main

---

# Step 3 — Update Main

Run

git pull origin main

If pull fails

Stop.

Explain the error.

Do not continue.

---

# Step 4 — Parse Arguments

Extract

## feature_number

Zero padded.

Examples

1 → 01

9 → 09

10 → 10

---

## feature_title

Human readable title.

Examples

Authentication

Quiz Generation

Question Bank

Student Dashboard

Adaptive Quiz Engine

Student Mastery Engine

AI Question Generator

Reinforcement Learning Engine

---

## feature_slug

Lowercase kebab-case.

Examples

authentication

quiz-generation

student-dashboard

adaptive-quiz-engine

student-mastery-engine

---

# Step 5 — Research Existing System

Read

CLAUDE.md

frontend/

backend/

database/

services/

ai/

rl/

supabase/

specs/

Verify the feature is not already implemented.

If it already exists

Stop.

Warn the user.

---

# Step 6 — Generate Specification

(Create the complete specification)

... (rest of the template remains unchanged)

---

# Step 7 — Save Spec

Save as

specs/<feature_number>-<feature_slug>.md

---

# Step 8 — Report

Print

Current Branch: main

Spec: specs/<feature_number>-<feature_slug>.md

Title: <feature_title>

Finally tell the user:

Review the specification carefully before implementation.

Verify

- database schema
- API contracts
- Supabase schema
- frontend components
- AI integration
- RL integration

before writing production code.