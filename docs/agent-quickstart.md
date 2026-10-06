# Agent quick start

For an Agent that can execute local commands and inspect images. This guide covers local-figma v0.1.0-alpha.3. The user supplies a Figma frame link, an editing request, and access to the design file; the Agent handles installation, scoped edits, and verification.

## 1. Install and connect

Requires macOS, Node.js 22+ with npm, and Figma Desktop. Figma's free Starter plan supports this workflow; AI assistant costs depend on the service used. The standard runtime requires no separate model API key.

Download [figma-local-runtime-0.1.0-alpha.3.tgz](https://github.com/denki-san/local-figma/releases/download/v0.1.0-alpha.3/figma-local-runtime-0.1.0-alpha.3.tgz). Install the release asset, not GitHub's Source code archives. No build is required.

```sh
npm install -g ./figma-local-runtime-0.1.0-alpha.3.tgz
figma-local help
mkdir -p ~/figma-local-project
cd ~/figma-local-project
figma-local init '<user-provided Figma frame link containing node-id>'
figma-local connect
```

Use one project directory for the binding and task evidence. In an existing project, run `figma-local doctor` before initializing or restarting anything. Use a separate project directory for a different design file.

`connect` stays running and prints a plugin manifest path. Give the user that exact path and these steps:

1. Open the target file in Figma Desktop.
2. Choose **Plugins → Development → Import plugin from manifest** and select the printed `manifest.json`.
3. Run **Figma Local Runtime** from the Development plugins menu.
4. Keep the plugin and connection terminal running. Run subsequent commands in another terminal in the same project directory.

When upgrading, inspect any active task first, stop the old plugin and bridge, install the new package, and restart both. Preserve `.figma-agent/` bindings and evidence.

## 2. Inspect the target and choose the design mode

```sh
figma-local doctor
figma-local inspect
figma-local wait <inspect-job-id>
figma-local result <inspect-job-id>
figma-local preview
figma-local wait <preview-job-id>
figma-local result <preview-job-id>
```

Replace each job ID with the `id` returned by its submission. Check the actual file and target node in the inspect result, then open the exported preview PNG. `doctor` readiness confirms the local connection, not the design target or visual quality. A `queued` response confirms submission only.

Before editing, establish the requested mode: **static design** or **interactive prototype**. For static work, create and refine screens without adding reactions or animation. Existing interactions remain unless their removal is requested. For prototypes, identify the required navigation, scrolling, overlays, and animation.

Explain the intended scope briefly. Preserve the existing content and style where requested; for new designs, establish page purpose, content, dimensions, and visual direction. Proceed within the user's authorized scope. Resolve missing product decisions before dependent work, and obtain authorization when expanding into shared components, global variables, or other areas outside that scope.

## 3. Execute semantic steps and verify results

For new content containers, prefer native Auto Layout: use vertical stacks for card content, lists, and forms, and horizontal stacks for button groups and rows. Set the target screen size explicitly; choose Fixed, Hug, or Fill for each axis according to the content. Fill requires a child of an Auto Layout container; Hug requires an Auto Layout container. Use `textAutoResize: "HEIGHT"` for wrapping text with a controlled width. Decorative elements and overlays may use absolute positioning where their design needs it. Inspect existing designs and convert individual regions; switching an entire existing design to Auto Layout can move children and change dimensions.

For a selected container, the layout command can establish Auto Layout and its sizing:

```sh
figma-local layout --direction vertical --horizontal-sizing fixed --vertical-sizing hug --width 320 --gap 12 --padding 20 --primary-align min --counter-align min
```

Use `--direction horizontal|vertical|none`, `--horizontal-sizing fixed|hug|fill`, `--vertical-sizing fixed|hug|fill`, `--primary-align min|center|max|space-between`, and `--counter-align min|center|max`. `--padding` applies to all sides; `--padding-top`, `--padding-right`, `--padding-bottom`, and `--padding-left` override individual sides. For a selected child of Auto Layout, the command uses the highest consecutive Auto Layout ancestor as its evidence scope so sibling reflow is included. Refresh plugin context if that ancestry changes. Read the command result, inspect the same node and reported layout scope, and verify the layout direction, sizing modes, spacing, padding, and alignment. For multi-step work, declare these properties and assertions in the workflow.

For multi-step tasks, use the [verified workflow guide](20260930-workflows.md). Build the plan around meaningful units such as a component, a screen, or a refinement, with descriptive names and machine-checkable assertions. Users do not need to write the plan JSON.

```sh
figma-local workflow import ./plan.json
figma-local workflow run <plan-id>
figma-local workflow status <plan-id>
```

Static plans use `capabilities: []`. Prototype plans declare only the capabilities needed: `navigation`, `scroll`, `overlay`, and `smartAnimate`. The plugin mirrors the journal's current step and result. `workflow run` proceeds sequentially until completion, failure, a pending result, or a review checkpoint; read its returned state before deciding the next action.

Use optional human checkpoints for decisions that need user judgment. At `awaiting-review`, inspect the result and wait for the user's acceptance before recording it:

```sh
figma-local workflow approve <plan-id> <step-id> 'User accepted the appearance and layout'
figma-local workflow run <plan-id>
```

Do not invent approval. Machine assertions establish declared properties, not visual acceptance. To add interactions later, create a new plan targeting the existing screens. **A connect step replaces all existing ON_CLICK reactions on its target with one action.** Inspect manual click handlers first; previous/current reactions are retained in the step result.

For a small edit or an operation outside the workflow schema, use the high-level commands listed by `figma-local help`, or a reviewed local JavaScript script. Scripts have access to the Figma Plugin API; inspect their target scope before execution. A `run` declared with `--high-risk` requires confirmation in the plugin.

For every submitted write, retain its job ID and read `wait` and `result` for that same ID. Check the result wrapper's `journalComplete` and nested `result.ok`; inspect `diff` and `validate` where applicable. Use `--node` or a workflow's `scopeNodeId` to keep large-file operations within a small verified subtree of the binding.

## 4. Review and deliver

Export and open a fresh preview after edits. Check layout, typography, content, and component consistency. For Auto Layout, construct representative card, list, and form examples and verify longer text, added or removed items, and a narrower container; inspect both the native layout properties and fresh previews after each change. Do not ask the user to supply examples when synthetic content is sufficient. For prototypes, click the main paths in Figma and verify navigation and overlays separately from machine assertions. Revisit earlier screens when later design decisions require consistent changes.

Give the user a concise change summary, a result preview, and any remaining visual or interaction checks. Report separately what was submitted, executed, machine-verified, visually inspected, and accepted by the user.

## Interrupted connections and uncertain results

Read `figma-local result <original-job-id>` and `figma-local status` before resubmitting anything. A timeout does not cancel the original job or prove that its edits failed. Retain its evidence and compare the current target with the recorded result.

For workflows:

- `done`: completed steps are skipped on subsequent runs.
- `waiting`: run again to read or claim the same request, without creating another attempt.
- `failed`: inspect the definite failure, address its cause, then explicitly use `workflow retry <plan-id>`.
- `needs-review`: run can consume a late complete result. Otherwise stop the previous plugin, obtain a fresh independent inspect of the exact original target, and resolve the original job before reconciliation.

```sh
figma-local inspect --node <original-target-id>
figma-local wait <inspection-job-id>
figma-local result <inspection-job-id>
figma-local resolve <original-job-id> --inspect <inspection-job-id> --previous-plugin-stopped
figma-local workflow reconcile <plan-id>
```

Only declare `--previous-plugin-stopped` after actually stopping the previous plugin. Restart the bridge and plugin as needed to perform the independent inspection. `resolve` records recovery evidence without turning an unknown original result into success. `reconcile` verifies the existing state without replaying the design operation. Recovery is bounded, not transactional rollback.

If the bridge exited unexpectedly, follow the recovery procedure in [manual quick start](quickstart.md). Workflow exit code 2 means waiting or review is required; inspect the JSON state as well as the exit code. The [output protocol](protocol.md) describes job evidence and other command exit codes.

## Local execution and data

The bridge runs on loopback, and `.figma-agent/` stores local scripts, results, design text, and previews. Review those files before sharing them. Figma account and file permissions still apply; the runtime does not grant additional access. An Agent or optional extension may send content to its configured remote services, so local execution does not imply that the entire workflow is offline. See [security](../SECURITY.md) for details.
