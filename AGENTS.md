# Agent workflow

Before doing project work, read `.agentflow/AGENT-CONTRACT.md`, then run:

```sh
python3 .agentflow/agentflow.py reconcile
python3 .agentflow/agentflow.py status
python3 .agentflow/agentflow.py doctor
```

Use the `.agentflow/agentflow.py` queue, supervisor, resource, run-manifest, and
gate commands as the authoritative workflow. Do not substitute self-reported
status or conversation memory.
