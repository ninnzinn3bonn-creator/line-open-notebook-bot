# Repository instructions

- `docs/REQUIREMENTS_v0.5.md` is the source of truth.
- Do not fork or modify Open Notebook. Integrate through its HTTP API.
- Never commit client data, credentials, `.env`, databases, logs, private evaluation data, or generated evaluation results.
- Verify the running Open Notebook OpenAPI before implementing its provider.
- Keep model, embedding, knowledge, query-mode, and prompt revisions explicit in evaluation output.
- Do not use subagents for this project unless the user changes this instruction.
