# local-figma

**Use natural language to make fast, batch edits to Figma designs while keeping existing styles consistent.**<br>
Share a frame link and your request with an Agent, then review the result as native, editable Figma layers.

[简体中文](README.md) | [English](README.en.md)

![Status: Alpha](https://img.shields.io/badge/status-alpha-orange)
![Node.js: 22+](https://img.shields.io/badge/node-%3E%3D22-339933)
![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

![local-figma: Describe what you need, then review the editable design](assets/product-hero.png)

## What do you need?

- **Figma Desktop**: Open a design file you can edit.
- **An AI assistant that can work on your computer (Agent)**: It needs to install tools, run commands, and inspect images. This guide calls it an Agent.

## How does it work?

You select a frame, describe the change, and review the result. The Agent uses local-figma to read, edit, and preview the design.

![Workflow: Select a frame and describe your request; the Agent edits it through local-figma and returns a screenshot and change summary](assets/usage-flow.png)

*The first use requires importing and running a plugin. After that, you can keep refining the same frame through the Agent. Follow these steps to get started.*

### 1. Install the plugin

Send this message to your Agent:

> Please read the [local-figma README](https://github.com/denki-san/local-figma/blob/main/README.en.md) and [Agent guide](https://github.com/denki-san/local-figma/blob/main/docs/agent-quickstart.md), then help me install and connect local-figma.

The Agent will give you the location of the plugin manifest and guide you through these steps:

1. In Figma, open **Plugins → Development → Import plugin from manifest**.
2. Select the manifest provided by the Agent.
3. Run **Figma Local Runtime** from the Development plugins menu.
4. When the plugin shows **“已连接” (Connected)**, return to your conversation with the Agent.

If the Agent asks for a frame link during installation, copy one using the next step. If you cannot find the file or menu, tell the Agent exactly where you are stuck.

**Keep the plugin and the connection process started by the Agent running while you work.**

<img src="assets/plugin-connected.png" alt="Figma Local Runtime plugin showing the connected state" width="420">

### 2. Select the frame to edit

In Figma, select the entire frame you want to edit, then right-click it and choose:

**Copy/Paste as → Copy link to selection**

This gives the Agent a link to the selected frame, so it knows which area you want to change.

<img src="assets/copy-selection-link.png" alt="Figma context menu showing Copy/Paste as, then Copy link to selection" width="520">

### 3. Describe your request and review the result

Send the frame link and your request together, for example:

> Frame link: 【paste your Figma selection link】
>
> Change requested: 【for example, change the sign-up button text to “Register now” and keep everything else unchanged】

The Agent will return a screenshot and a summary of changes. Check the result in Figma. If the task added navigation, click through the main path as well.

## Introducing five use cases

| Task | What you get |
| --- | --- |
| **Design from scratch** | An editable, native Figma design based on your brief and references |
| **Refine an existing design** | Local changes that preserve its styles and components, with a before-and-after comparison |
| **Design to Code** | A running page based on the design, plus a visual comparison |
| **Code to Design** | An editable Figma design based on code and a running page |
| **Build an interactive prototype** | A Figma prototype with clickable navigation, back actions, overlays, and scrolling |

## Frequently asked questions

### 1. Do I need to write code?

For everyday use, you only need to describe your request, open the plugin when prompted, and review the result. The Agent handles installation and commands.

### 2. Why do I need an Agent?

local-figma connects to and operates Figma. Your Agent interprets your request, proposes a design approach, and decides how to make the changes.

### 3. What if the connection drops or the task takes a long time?

Send the plugin status or error message to your Agent. You can say:

> Please check whether the last edit finished before restoring the connection.

Wait for the Agent to verify the original task before continuing. This avoids doing the same edit twice.

### 4. How do I work on another frame or file?

Send the new selection link to your Agent. It will verify the target and reconnect if needed.

## Download and further help

Current preview release: **[v0.1.0-alpha.2](https://github.com/denki-san/local-figma/releases/tag/v0.1.0-alpha.2)**. Share this page with your Agent to get started.

- More ways to phrase a request: [task examples](docs/first-task.md)
- Installation and workflow instructions for Agents: [Agent guide](docs/agent-quickstart.md)
- Run the commands yourself: [manual setup guide](docs/quickstart.md)
- Build an extension: [extension interfaces](docs/extensions.md)
- Version changes and data handling: [release notes](docs/releases/v0.1.0-alpha.2.md) · [security](SECURITY.md)

Licensed under [Apache-2.0](LICENSE).
