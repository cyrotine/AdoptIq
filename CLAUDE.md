# CLAUDE.md

# AdaptIQ

### AI-Powered Adaptive Learning Platform

---

# Project Vision

AdaptIQ is an intelligent adaptive learning platform that personalizes education for every student.

The platform combines:

- AI-generated quizzes
- Student performance tracking
- Topic-wise mastery estimation
- Reinforcement Learning
- Personalized quiz generation

The goal is **not** to build another quiz website.

The goal is to build a learning system that continuously understands every student's strengths and weaknesses and adapts future quizzes accordingly.

---

# Core Principle

Every feature should contribute to one of these capabilities:

• Learn about the student

• Personalize learning

• Improve long-term mastery

Avoid features that only display data.

Prioritize learning effectiveness over feature quantity.

---

# Tech Stack

Frontend

- React
- TypeScript
- Tailwind CSS

Backend

- Node.js
- Express

Database

- Supabase (PostgreSQL)

Authentication

- JWT

Future AI

- Gemini / OpenAI

Future Reinforcement Learning

- Python Service

---

# Project Structure

frontend/

backend/

database/

services/

ai/

rl/

supabase/

specs/

---

# Development Philosophy

Always follow these rules.

1. Keep every module focused.

2. Database must remain normalized.

3. Never duplicate data that can be derived.

4. Business logic belongs inside services.

5. Every feature must be production ready.

6. No mock implementations unless explicitly requested.

7. Prefer readability over clever code.

8. Every feature should be independently testable.

9. Use reusable React components.

10. Keep AI prompts modular.

---

# Database Design Rules

Always follow these principles.

## Never duplicate data

Example

Don't store

- Overall Accuracy

Instead calculate

correct_answers / (total_quizzes × 30)

---

Don't store

- Wrong Answers

Calculate

30 - correct_answers

---

Don't store

- Subject inside Questions

Retrieve

Question

↓

Topic

↓

Chapter

↓

Subject

---

Don't store

- Correct Answer inside QuizResponses

Retrieve from Questions.

---

Don't store

- Explanation inside QuizResponses

Retrieve from Questions.

---

Only store information that cannot be derived.

---

# Current Database

Students

student_id

name

username

email

password_hash

class

total_quizzes

correct_answers

---

Subjects

subject_id

subject_name

---

Chapters

chapter_id

chapter_name

class

subject_id

---

Topics

topic_id

chapter_id

topic_name

---

Questions

question_id

question_text

option_a

option_b

option_c

option_d

correct_answer

explanation

topic_id

difficulty_label

estimated_time

---

QuizHistory

quiz_id

student_id

subject

easy_count

medium_count

hard_count

correct_answers

total_time_taken

completed_on

---

QuizResponses

quiz_id

question_id

student_answer

time_taken

---

# Data Relationships

Students

↓

QuizHistory

↓

QuizResponses

↓

Questions

↓

Topics

↓

Chapters

↓

Subjects

---

# API Rules

Never place business logic inside routes.

Always

Route

↓

Controller

↓

Service

↓

Database

---

# AI Principles

AI should only be used for

- Question Generation

- Explanation Generation

- Difficulty Recommendation

- Personalized Suggestions

Never allow AI to modify database records directly.

AI always returns structured JSON.

---

# Reinforcement Learning Principles

RL never changes

Question Difficulty.

RL updates

Student Mastery.

Student Mastery determines

Future Quiz Composition.

---

# Frontend Principles

Prioritize

- Simplicity

- Speed

- Accessibility

- Clean UI

Every page must have

Loading state

Error state

Empty state

---

# Security Rules

Never expose

Supabase Keys

JWT Secret

LLM Keys

Database credentials

Never trust frontend validation.

Always validate again on backend.

Passwords must always be hashed.

---

# MVP Scope

Version 1 includes

- Authentication

- Question Bank

- Quiz Generation

- Quiz Submission

- Result Page

- Quiz History

Everything else is secondary.

---

# Roadmap

Phase 1

Authentication

Question Bank

Quiz Engine

Result Page

Quiz History

---

Phase 2

Student Topic Mastery

Analytics Dashboard

Performance Tracking

---

Phase 3

AI Question Generator

AI Explanations

Weak Topic Recommendation

---

Phase 4

Reinforcement Learning

Adaptive Quiz Generator

Personalized Difficulty

---

# Success Metric

A student should be able to

1. Register

2. Login

3. Select Subject

4. Receive a personalized quiz

5. Complete the quiz

6. View detailed explanations

7. Review previous quizzes

8. Improve over time through adaptive learning

If this workflow functions end-to-end, the MVP is successful.

---

# Claude Development Rules

Before implementing any feature

1. Run

git status

If the working tree is dirty

STOP.

Do not continue.

Ask the user to commit or stash changes.

---

Always work on

main

Never create feature branches.

Never commit automatically.

Never push automatically.

---

Every new feature must begin with a specification.

Specifications are saved in

specs/

Every specification must include

- Overview

- User Story

- Functional Requirements

- Database Changes

- Backend Changes

- Frontend Changes

- API Changes

- AI Changes

- RL Changes

- Supabase Changes

- Data Flow

- Risks

- Definition of Done

Implementation begins only after the specification is approved.

---

# Long-Term Vision

AdaptIQ should evolve into an AI tutor rather than a quiz application.

Every completed quiz should improve the system's understanding of the student.

The platform should continuously personalize learning paths using AI and Reinforcement Learning, creating a unique educational experience for every learner.