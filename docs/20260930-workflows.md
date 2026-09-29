# Verified multi-step workflows

A workflow is a sequence of semantic edits: a component, a local refinement, a screen, or another bounded unit. Each step has a target, a structured operation, and machine-checkable assertions. A workflow does not require an `AGENTS.md` file.

The Agent writes the plan from the user's request. The CLI validates it, submits one step at a time, and persists results. The plugin executes native Figma operations and displays progress from the same journal. Machine assertions check the declared facts; they do not establish visual quality or user acceptance.

## Quick start

Use an existing connected local-figma project. The Agent creates a plan file; users do not need to author JSON themselves.

```sh
figma-local workflow import ./20260930-card-plan.json
figma-local workflow run card-demo
figma-local workflow status card-demo
```

Example plan:

```json
{
  "version": 1,
  "id": "card-demo",
  "title": "Create a reusable card",
  "capabilities": [],
  "steps": [
    {
      "id": "card",
      "title": "Create the card container",
      "operation": {
        "kind": "create",
        "type": "FRAME",
        "properties": {
          "name": "Card",
          "width": 320,
          "height": 180,
          "fill": "#FFFFFF",
          "cornerRadius": 16
        }
      },
      "assertions": [
        { "property": "type", "equals": "FRAME" },
        { "property": "childCount", "equals": 0 }
      ],
      "humanReview": true
    },
    {
      "id": "title",
      "title": "Add the card title",
      "target": { "path": ["Card"], "type": "FRAME" },
      "operation": {
        "kind": "create",
        "type": "TEXT",
        "properties": {
          "name": "Title",
          "characters": "Your collection",
          "x": 20,
          "y": 20,
          "fontSize": 24
        }
      },
      "assertions": [
        { "property": "characters", "equals": "Your collection" }
      ]
    }
  ]
}
```

The first step stops at `awaiting-review`. Inspect the Figma result or its exported preview. After the user explicitly accepts the checkpoint, record their feedback and continue:

```sh
figma-local workflow approve card-demo card 'User accepted the card dimensions and appearance'
figma-local workflow run card-demo
```

`approve` records an explicit CLI confirmation; it does not authenticate who made the judgment. An Agent must not invent human approval or use machine assertions as a substitute. Use human checkpoints only for decisions that need them, not for every routine edit.

## Capabilities and static-first work

Capabilities must be explicit. `[]` is static design. Available capabilities are `navigation`, `scroll`, `overlay`, and `smartAnimate`. A prototype chooses only the capabilities it needs; there is no implicit enable-all mode. The plugin displays static design or interactive prototype according to this set.

The workflow validator rejects an interaction operation whose capability is absent. The structured runtime cannot write arbitrary Figma properties or execute plan-provided JavaScript. Existing trusted `run` scripts and standalone commands remain separate operations; workflow capabilities do not sandbox those commands or remove existing interactions from a design.

To upgrade a static design, import a new plan ID with the needed capabilities and use `connect` or `scroll` steps targeting the existing node IDs or exact paths. No screen recreation is necessary. **`connect` replaces every existing ON_CLICK reaction on its target with one action, including manually authored multi-action click handlers.** Other triggers are preserved. Inspect existing click handlers before upgrading. Each completed connect result includes `reactionChange.previous` and `reactionChange.current`; the pre-edit snapshot also retains the original reactions if execution fails. An imported plan is immutable: continue it with `run`, or create a new plan for a revised objective.

## Operations

| Kind | Fields | Behavior |
| --- | --- | --- |
| `create` | `type`, `properties` | Creates FRAME, RECTANGLE, ELLIPSE, TEXT, or COMPONENT under the target. A retry reuses the step's existing output. |
| `update` | `properties` | Sets declared properties on the target. |
| `scroll` | `direction` | Sets NONE, HORIZONTAL, VERTICAL, or HORIZONTAL_AND_VERTICAL; requires `scroll`. |
| `connect` | `destination`, optional `navigation`, `animate` | Replaces all ON_CLICK reactions with one action; records the previous/current reactions and preserves other triggers. NAVIGATE is the default; OVERLAY requires `overlay`. `animate: true` requires `smartAnimate`. |

Properties: `name`, `x`, `y`, `width`, `height`, `opacity`, `visible`, `cornerRadius`, `characters`, `fontSize`, `fontFamily`, `fontStyle`, and solid `fill` in `#RRGGBB` format. Editing text preserves its existing font unless a font override is supplied. Figma may normalize dimensions or other values; postconditions detect the resulting difference.

This first version intentionally supports a bounded set of operations. Existing commands and trusted scripts remain available for UI Kit imports, complex Auto Layout, instances, and other operations not in this schema. Arbitrary scripts are not advertised as idempotent workflows.

## Targets and verification

A step's optional `scopeNodeId` selects a subtree inside the project binding. Its `target` and assertion targets are resolved inside that subtree. Without a target, the scope root is used. A `create` target is the parent; its default assertion subject is the created node. Other operations assert against the edited node.

A selector accepts `id`, `path` (an array of exact child names), and optional expected `name` and `type`. An existing ID takes priority and must pass those checks. If that ID is missing, an explicitly supplied path may resolve the replacement. Missing paths, duplicate names, unexpected types, and out-of-scope IDs stop execution. Renaming nodes requires updating subsequent selectors; paths are a fallback, not a promise that names are unique.

Each step requires assertions. Available properties include `exists`, `name`, `type`, `childCount`, `fill`, dimensions, position, `visible`, `opacity`, `characters`, `fontSize`, `reactionCount`, and `overflowDirection`. `exists` supports only `equals: true`; missing targets fail during resolution, and `exists: false` is rejected before execution. Use `equals` and optional numeric `tolerance`; fill assertions use uppercase hex. Declared operation properties also become automatic postconditions, so an `exists` assertion cannot hide a partial property update. Visual and interaction reviews remain separately unverified.

Workflow steps retain existing snapshot limits. Use a local `scopeNodeId` for large files; workflows do not bypass the full-snapshot budget or claim to verify an entire large page from a truncated snapshot.

## Journals, retry, and recovery

The authoritative workflow journal is `.figma-agent/workflows/<id>.json`. It includes the immutable plan, original generated scripts, attempts, request/job IDs, results, and approval notes. Individual job evidence remains in `.figma-agent/runs/<job-id>/`. A current-workflow pointer selects the journal mirrored by the plugin. The plugin does not maintain a second progress state or advance the workflow. For failed assertions, the summary includes the first failure’s property, expected value, and actual value, each capped at 80 characters.

- `done`: assertions passed and any requested human checkpoint was accepted. Re-running skips the step.
- `awaiting-review`: wait for user acceptance, then `approve` and `run`.
- `waiting`: a response or result is pending. `run` reads or claims the same request; it does not create a new attempt.
- `failed`: a definite execution or verification failure. `run` stops. After inspecting the recorded result, `retry` explicitly creates a new attempt for that step.
- `needs-review`: the previous job has an uncertain outcome. `run` can read a late complete result without resubmitting it. Otherwise use the existing independent `inspect` + `resolve` flow, then `reconcile`.

```sh
figma-local workflow retry card-demo
# For an uncertain original job, first inspect and resolve using the existing recovery commands:
figma-local workflow reconcile card-demo
```

`reconcile` checks existing nodes and all operation postconditions without applying the design operation. It requires the original job's resolution evidence (or consumes an already complete result). If verification passes, the workflow continues, including any human checkpoint. If it fails, the state is `failed`; inspecting the result and explicitly retrying is still required.

The client persists a UUID request ID before submission. Repeating the same request ID returns its original job, including after bridge restart; changing its payload is rejected. Incomplete request journals stop recovery rather than being replayed. For `create`, shared plugin data in the `localFigmaWorkflow` namespace records the step marker and output ID. This works with development manifests that have no plugin ID; these non-secret markers are visible to other plugins. Moved, deleted, ambiguous, or corrupted outputs require investigation rather than silently creating replacements. This is bounded recovery, not a claim of transactional atomicity across Figma and the local filesystem.

A filesystem lock serializes workflow CLI mutations. Dead-owner recovery is itself serialized and rechecks the owner. If recovery is interrupted while holding its reclaim lock, inspect the recorded processes and lock files before cleanup; do not remove a live process's lock.

Exit codes: 0 for a completed local command, including import/status/approval; 1 for definite failure; 2 for waiting or review. Check the returned workflow state as well.

## Validation performed

Tests cover real CLI → HTTP bridge → plugin-code execution with simulated Figma document objects; request deduplication and bridge restart; interrupted property writes; failed assertions; human checkpoints; unknown outcomes and late results; concurrent stale-lock recovery; and plugin progress rendering. A Figma Desktop smoke test also verified two static steps, the visible completed-progress panel, and re-execution reusing the same node ID. A follow-up desktop test executed three connect steps and read back native reactions for NAVIGATE, OVERLAY, and SMART_ANIMATE with EASE_IN_AND_OUT and a 0.3-second duration (stored as approximately 0.300000012). Prototype preview clicks verified navigation and Back, a visible Smart Animate transition and its settled destination, and overlay opening and closing. Temporary test frames and the test flow starting point were removed after inspection.
