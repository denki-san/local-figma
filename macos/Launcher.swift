import AppKit

// 开发版连接窗口。进程参数独立传递，不通过 shell 解释用户输入。
final class Launcher: NSObject, NSApplicationDelegate {
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 320), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
    let link = NSTextField(string: "")
    let status = NSTextField(wrappingLabelWithString: "需要你处理：粘贴包含 node-id 的 Figma 画板或页面链接。")
    let connect = NSButton(title: "启动连接", target: nil, action: nil)
    let reveal = NSButton(title: "定位插件文件", target: nil, action: nil)
    var service: Process?
    var timer: Timer?
    var node: URL?
    var checking = false
    var preparing = false
    var busy = false
    var manifest: URL?
    let manager = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/local-figma", isDirectory: true)
    var cli: URL { Bundle.main.resourceURL!.appendingPathComponent("runtime/bin/figma-local.mjs") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        window.title = "local-figma · 开发版"
        window.isReleasedWhenClosed = false
        window.center()
        let title = NSTextField(labelWithString: "连接你的 Figma")
        title.font = .systemFont(ofSize: 24, weight: .semibold)
        link.placeholderString = "https://www.figma.com/design/…?node-id=…"
        connect.target = self; connect.action = #selector(start)
        reveal.target = self; reveal.action = #selector(showManifest); reveal.isEnabled = false
        let help = NSTextField(wrappingLabelWithString: "首次连接后，在 Figma 的 Plugins → Development 中导入 manifest.json 并运行插件。保持本应用运行；关闭窗口仍可在 Dock 中重新打开。需要已安装 Node.js 22+。")
        let buttons = NSStackView(views: [connect, reveal]); buttons.spacing = 12
        let stack = NSStackView(views: [title, link, buttons, status, help])
        stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -24), stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 24), link.widthAnchor.constraint(equalTo: stack.widthAnchor)])
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        if let data = try? Data(contentsOf: manager.appendingPathComponent(".figma-agent/binding.json")), let binding = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let saved = binding["sourceUrl"] as? String { link.stringValue = saved }
    }

    // 仅探测标准安装位置，不执行 PATH 中不明来源的同名命令。
    func findNode() -> URL? {
        for path in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
            if FileManager.default.isExecutableFile(atPath: path) { return URL(fileURLWithPath: path) }
        }
        return nil
    }

    func command(_ args: [String], completion: @escaping (Int32, [String: Any]) -> Void) {
        guard let node = node else { completion(1, ["error": "需要安装 Node.js 22+"]); return }
        let command = Process(), output = Pipe()
        command.executableURL = node; command.arguments = cliArguments(args)
        command.currentDirectoryURL = FileManager.default.fileExists(atPath: manager.path) ? manager : FileManager.default.homeDirectoryForCurrentUser
        command.standardOutput = output; command.standardError = FileHandle.nullDevice
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try command.run()
                DispatchQueue.global().asyncAfter(deadline: .now() + 15) { if command.isRunning { command.terminate() } }
                let data = output.fileHandleForReading.readDataToEndOfFile()
                command.waitUntilExit()
                let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? ["error": "命令未返回有效结果，请让 Agent 检查；保留现有连接与任务。"]
                DispatchQueue.main.async { completion(command.terminationStatus, value) }
            } catch { DispatchQueue.main.async { completion(1, ["error": "无法启动 Node.js，请检查安装。"] ) } }
        }
    }

    // 在导入任何运行时代码或创建绑定之前检查版本，避免旧 Node 留下半成品。
    func cliArguments(_ args: [String]) -> [String] {
        let guardCode = "if(Number(process.versions.node.split('.')[0])<22){console.log(JSON.stringify({error:'需要 Node.js 22+，请升级后重试'}));process.exit(1)};const {pathToFileURL}=await import('node:url');await import(pathToFileURL(process.argv[1]).href);"
        return ["--input-type=module", "--eval", guardCode, cli.path] + args
    }

    @objc func start() {
        guard service == nil, !preparing else { return }
        let requested = link.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URLComponents(string: requested), url.scheme == "https",
              ["figma.com", "www.figma.com"].contains(url.host ?? ""), url.user == nil, url.password == nil, url.port == nil,
              url.path.range(of: "^/(design|file)/[A-Za-z0-9_-]+(/|$)", options: .regularExpression) != nil,
              let targetID = url.queryItems?.first(where: { $0.name == "node-id" })?.value,
              targetID.replacingOccurrences(of: "-", with: ":").range(of: "^[0-9]+:[0-9]+$", options: .regularExpression) != nil else {
            status.stringValue = "需要你处理：请粘贴包含 node-id 的 HTTPS Figma 画板或页面链接。"; return
        }
        node = findNode()
        guard node != nil else { status.stringValue = "需要你处理：请先从 nodejs.org 安装 Node.js 22+，再重新打开应用。"; return }
        preparing = true; connect.isEnabled = false; link.isEnabled = false
        status.stringValue = "正在准备连接…"
        command(["setup", requested]) { code, value in
            self.preparing = false
            guard code == 0, let manifest = value["manifest"] as? String else {
                self.status.stringValue = "需要你处理：\(value["error"] as? String ?? "准备失败")"
                self.connect.isEnabled = true; self.link.isEnabled = true; return
            }
            self.manifest = URL(fileURLWithPath: manifest)
            self.launchService()
        }
    }

    func launchService() {
        guard let node = node else { return }
        let process = Process(), output = Pipe()
        process.executableURL = node; process.arguments = cliArguments(["serve"])
        process.currentDirectoryURL = manager
        process.standardOutput = output; process.standardError = FileHandle.nullDevice
        process.terminationHandler = { finished in
            let data = output.fileHandleForReading.readDataToEndOfFile()
            let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            DispatchQueue.main.async {
                guard self.service === finished else { return }
                self.timer?.invalidate(); self.timer = nil; self.service = nil
                self.busy = false; self.checking = false
                self.connect.isEnabled = true; self.link.isEnabled = true; self.reveal.isEnabled = false
                self.status.stringValue = "需要你处理：\(value?["error"] as? String ?? "连接进程已退出；请让 Agent 检查未确认的任务，再重新连接。")"
            }
        }
        do {
            try process.run(); service = process
            status.stringValue = "正在连接：首次使用请导入并运行插件。"
            timer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { _ in self.refresh() }
            refresh()
        } catch { status.stringValue = "需要你处理：无法启动连接进程。"; connect.isEnabled = true; link.isEnabled = true }
    }

    func refresh() {
        guard !checking, let current = service, current.isRunning else { return }
        checking = true
        command(["doctor"]) { _, value in
            guard self.service === current else { return }
            self.checking = false
            guard current.isRunning else { return }
            let checks = value["checks"] as? [[String: Any]] ?? []
            self.busy = checks.contains { $0["code"] as? String == "ACTIVE_JOB" }
            let identity = checks.contains { $0["code"] as? String == "BRIDGE" && $0["status"] as? String == "ok" }
            self.reveal.isEnabled = identity && self.manifest.map { FileManager.default.fileExists(atPath: $0.path) } == true
            if value["ready"] as? Bool == true { self.status.stringValue = "已连接：在 Figma 选中要修改的区域，然后向 Agent 描述需求。" }
            else if self.busy { self.status.stringValue = "执行中：等待当前任务完成，请勿重复提交。" }
            else if identity { self.status.stringValue = "正在重连：请保持 Figma 插件运行；首次使用先导入插件。" }
            else { self.status.stringValue = "需要你处理：连接尚未就绪；可能已有其它会话占用端口。请让 Agent 检查，应用不会停止其它进程。" }
        }
    }

    @objc func showManifest() { if let manifest = manifest { NSWorkspace.shared.activateFileViewerSelecting([manifest]) } }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if preparing || checking || busy { status.stringValue = "需要你处理：请等待准备、检查或当前任务结束后再退出。"; window.makeKeyAndOrderFront(nil); return .terminateCancel }
        guard let service = service, service.isRunning else { return .terminateNow }
        let alert = NSAlert(); alert.messageText = "停止本应用的 Figma 连接？"
        alert.informativeText = "请先确认 Agent 已停止提交任务。未确认的任务会保留供后续核查；不会自动重放。"
        alert.addButton(withTitle: "取消"); alert.addButton(withTitle: "停止并退出")
        guard alert.runModal() == .alertSecondButtonReturn else { return .terminateCancel }
        service.terminate(); return .terminateNow
    }
}
let app = NSApplication.shared
let delegate = Launcher()
app.delegate = delegate
app.setActivationPolicy(.regular)
let menu = NSMenu(), item = NSMenuItem(), submenu = NSMenu()
submenu.addItem(withTitle: "退出 local-figma", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
item.submenu = submenu; menu.addItem(item); app.mainMenu = menu
let edit = NSMenuItem(), editMenu = NSMenu(title: "编辑")
editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
edit.submenu = editMenu; menu.addItem(edit)
app.run()
