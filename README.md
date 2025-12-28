# AI Brainstorm

> A multi-agent AI brainstorming playground where AI agents with diverse personalities collaborate to explore ideas, debate topics, and solve problems together.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Vite](https://img.shields.io/badge/Vite-6.0-purple)

## Overview

**AI Brainstorm** is a web-based application that simulates multi-agent discussions powered by Large Language Models (LLMs). Instead of having a single AI assistant, you orchestrate a team of AI agents—each with unique expertise, thinking styles, and personalities—to collaborate on complex topics, brainstorm ideas, make decisions, or analyze problems from multiple perspectives.

### Key Concept

Imagine having a virtual meeting room where a Devil's Advocate challenges assumptions, an Optimist explores opportunities, a Researcher digs into facts, and a Mediator finds common ground—all discussing your topic simultaneously. That's AI Brainstorm.

## Features

### Multi-Agent Conversations

- **Multiple AI Agents**: Create conversations with 2-10+ AI agents, each with distinct roles
- **Round-Based Discussions**: Agents take turns speaking in organized rounds
- **Real-Time Streaming**: Watch agent responses stream in real-time
- **Secretary Agent**: A neutral observer that summarizes discussions and produces structured results

### Flexible LLM Provider Support

Connect to various LLM providers:

| Provider Type | API Format | Examples |
|---------------|------------|----------|
| OpenAI-Compatible | `openai` | OpenRouter, OpenAI, Azure OpenAI, local APIs |
| Anthropic | `anthropic` | Claude models via Anthropic API |
| Ollama | `ollama` | Local LLMs via Ollama |

### Built-in Agent Presets

Choose from 25+ pre-configured agent personalities across categories:

#### General Purpose
- **Devil's Advocate** — Challenges assumptions constructively
- **Optimist** — Focuses on opportunities and possibilities
- **Skeptic** — Questions claims and demands evidence
- **Mediator** — Finds common ground and builds consensus
- **Researcher** — Conducts thorough investigation
- **Synthesizer** — Connects ideas and identifies patterns
- **Brainstormer** — Generates ideas rapidly and creatively
- **Innovator** — Focuses on novel and disruptive approaches
- **Facilitator** — Guides productive discussions
- **Strategic Coach** — Asks powerful questions focused on outcomes

#### Software Development
- Software Architect
- Senior Frontend Developer
- Senior Backend Developer
- DevOps Engineer
- Security Expert
- Database Expert
- QA Engineer
- UX Designer
- Product Manager

#### Finance & Trading
- Portfolio Manager
- Financial Analyst
- Risk Manager
- Trader
- Compliance Officer

### Starting Strategies

Launch discussions with structured approaches:

| Strategy | Description | First Speaker |
|----------|-------------|---------------|
| **Open Brainstorm** | Free-form exploration of ideas | Random |
| **Structured Debate** | Pro/con analysis with clear positions | First in order |
| **Decision Making** | Systematic evaluation of options | Most relevant expert |
| **Problem Solving** | Understand the problem before solving | First in order |
| **Expert Analysis** | Domain expert leads with deep analysis | Most relevant expert |
| **Devil's Advocate** | Challenge assumptions and stress-test ideas | Random |

### Conversation Modes

- **Round-Robin**: Agents speak in a fixed order each round
- **Moderator**: A designated agent guides the discussion flow
- **Dynamic**: AI determines who should speak next based on context

### Rich Configuration

Each agent can be configured with:

- **Thinking Depth** (1-5): How deeply the agent analyzes before responding
- **Creativity Level** (1-5): Temperature/randomness in responses
- **Notebook Usage**: How much context to dedicate to personal notes
- **Custom Prompts**: Fine-tune agent behavior for specific needs

### Result Generation

The Secretary agent produces structured output including:

- **Executive Summary** — 2-3 sentence overview
- **Main Themes** — Key topics identified
- **Areas of Consensus** — Where agents agreed
- **Areas of Disagreement** — Conflicting viewpoints
- **Recommendations** — Suggestions from the discussion
- **Action Items** — Concrete next steps
- **Open Questions** — Unresolved issues
- **Round Summaries** — Round-by-round progress

## Architecture

```
ai-brainstorm/
├── src/
│   ├── agents/           # Agent logic and presets
│   │   ├── agent.ts          # Agent runtime class
│   │   ├── agent-factory.ts  # Agent creation
│   │   ├── secretary.ts      # Secretary agent (neutral summarizer)
│   │   ├── notebook.ts       # Agent personal notes
│   │   └── presets/          # Built-in agent configurations
│   │
│   ├── components/       # Web Components (Custom Elements)
│   │   ├── app-shell.ts          # Main application container
│   │   ├── nav-sidebar.ts        # Conversation navigation
│   │   ├── conversation-view.ts  # Main conversation display
│   │   ├── message-stream.ts     # Message rendering
│   │   ├── agent-roster.ts       # Agent list/management
│   │   └── ...
│   │
│   ├── engine/           # Conversation orchestration
│   │   ├── conversation-engine.ts  # Main orchestrator
│   │   ├── turn-manager.ts         # Turn scheduling
│   │   ├── turn-executor.ts        # Turn execution
│   │   ├── context-builder.ts      # Prompt context assembly
│   │   ├── result-manager.ts       # Result draft management
│   │   └── state-machine.ts        # Conversation state
│   │
│   ├── llm/              # LLM integration
│   │   ├── llm-router.ts       # Routes requests to providers
│   │   ├── prompt-builder.ts   # Constructs prompts
│   │   ├── token-counter.ts    # Token estimation
│   │   └── providers/          # Provider implementations
│   │       ├── openai-provider.ts
│   │       ├── anthropic-provider.ts
│   │       └── ollama.ts
│   │
│   ├── storage/          # Data persistence
│   │   ├── db.ts               # IndexedDB via Dexie
│   │   └── storage-manager.ts  # CRUD operations
│   │
│   ├── strategies/       # Discussion strategies
│   │   ├── starting-strategies.ts  # Strategy definitions
│   │   └── conversation-templates.ts
│   │
│   ├── styles/           # CSS
│   │   ├── global.css
│   │   ├── variables.css
│   │   └── animations.css
│   │
│   ├── types/            # TypeScript definitions
│   │   └── index.ts
│   │
│   └── utils/            # Utilities
│       ├── event-bus.ts      # Event system
│       ├── helpers.ts
│       ├── keyboard.ts       # Keyboard shortcuts
│       └── export.ts         # Export functionality
│
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Tech Stack

- **Runtime**: Vanilla TypeScript with Web Components (no framework)
- **Build**: Vite 6
- **Storage**: IndexedDB via Dexie.js
- **Token Counting**: gpt-tokenizer
- **IDs**: UUID v4
- **Styling**: CSS Custom Properties with dark/light themes

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd ai-brainstorm

# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## Configuration

### Setting Up LLM Providers

1. Open the application
2. Click the **Settings** gear icon in the sidebar
3. Navigate to **LLM Providers**
4. Configure your preferred provider:

#### OpenRouter (Recommended for Multiple Models)
- Name: `OpenRouter`
- API Format: `OpenAI Compatible`
- Base URL: `https://openrouter.ai/api/v1`
- API Key: Your OpenRouter API key

#### Local Ollama
- Name: `Ollama`
- API Format: `Ollama`
- Base URL: `http://localhost:11434`
- No API key required

#### OpenAI Direct
- Name: `OpenAI`
- API Format: `OpenAI Compatible`  
- Base URL: `https://api.openai.com/v1`
- API Key: Your OpenAI API key

### Creating a Conversation

1. Click **+ New Conversation** in the sidebar
2. Enter a **Subject** (what you want to discuss)
3. Define the **Goal** (what you want to achieve)
4. Select a **Starting Strategy**
5. Choose **Agents** from presets or create custom ones
6. Configure conversation settings (speed, rounds, etc.)
7. Click **Create & Start**

## How It Works

### Conversation Flow

```
1. User creates conversation with subject, goal, and agents
                    ↓
2. Engine initializes with selected strategy
                    ↓
3. Opening statement is created (based on strategy)
                    ↓
4. Round 1 begins:
   ├── Turn Manager determines next speaker
   ├── Context Builder assembles prompt with:
   │   ├── System prompt (agent personality)
   │   ├── Conversation history
   │   ├── Agent's personal notebook
   │   └── Strategy instructions
   ├── Turn Executor sends to LLM
   ├── Response streams back to UI
   └── Message stored in database
                    ↓
5. When all agents have spoken:
   ├── Round completes
   ├── Secretary generates round summary
   └── Next round begins
                    ↓
6. User can:
   ├── Pause/Resume conversation
   ├── Add interjections (messages to all agents)
   ├── Force specific agent to speak next
   └── Stop and generate final result
                    ↓
7. Secretary generates structured result document
```

### Agent Context

Each agent receives a carefully constructed context:

```
┌─────────────────────────────────────────┐
│ System Prompt                           │
│ ├── Agent personality & expertise       │
│ ├── Role-specific instructions          │
│ └── Strategy guidelines                 │
├─────────────────────────────────────────┤
│ Conversation Context                    │
│ ├── Subject & Goal                      │
│ ├── Ground rules                        │
│ ├── Other agents (names & roles)        │
│ └── Recent messages (within token limit)│
├─────────────────────────────────────────┤
│ Personal Notebook (optional)            │
│ └── Agent's private notes & thoughts    │
├─────────────────────────────────────────┤
│ Current Prompt                          │
│ └── "It's your turn to contribute..."   │
└─────────────────────────────────────────┘
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + N` | New conversation |
| `Space` | Start/Pause conversation |
| `Escape` | Stop conversation |
| `Ctrl/Cmd + ,` | Open settings |

## Data Storage

All data is stored locally in your browser using IndexedDB:

- **Conversations** — Subject, goal, settings, status
- **Agents** — Configuration per conversation
- **Messages** — Full conversation history
- **Turns** — Turn tracking for idempotency
- **Notebooks** — Agent personal notes
- **Result Drafts** — Secretary summaries
- **Presets** — Built-in + custom agent templates
- **Providers** — LLM provider configurations
- **Settings** — App preferences

## Use Cases

### Brainstorming
Assemble a team of creative thinkers, skeptics, and domain experts to generate and refine ideas.

### Decision Making
Have agents argue different positions, weigh pros/cons, and work toward a recommendation.

### Problem Analysis
Let experts from different domains examine a problem from multiple angles.

### Technical Design
Bring together architects, security experts, and developers to discuss system designs.

### Investment Analysis
Create a team of analysts, risk managers, and traders to evaluate opportunities.

### Creative Writing
Use varied perspectives to develop stories, characters, or plot lines.

### Learning & Exploration
Explore topics through Socratic dialogue with questioning agents.

## Limitations

- **No internet access for agents** — Agents work from their training data only
- **Context window limits** — Long conversations may truncate older messages
- **API costs** — Each agent response incurs LLM API costs
- **Browser storage limits** — Very long conversations may approach IndexedDB limits

## License

MIT License — See [LICENSE](LICENSE) for details.

---

Built with curiosity and caffeine ☕

