import SwiftUI

struct ToolDetailView: View {
    @EnvironmentObject var toolsViewModel: ToolsViewModel
    @State private var tool: ToolCatalogItem
    @State private var editedBundleIds: String = ""
    @State private var editedAppNames: String = ""
    @State private var editedTitlePatterns: String = ""
    @State private var showIgnoreSheet: Bool = false
    @State private var newIgnoreValue: String = ""
    @State private var newIgnoreReason: String = ""

    init(tool: ToolCatalogItem) {
        _tool = State(initialValue: tool)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(tool.name)
                            .font(.title2)
                            .fontWeight(.bold)
                        HStack(spacing: 8) {
                            if tool.isDefault {
                                Text("内置")
                                    .font(.system(size: 10))
                                    .foregroundColor(.blue)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.blue.opacity(0.1))
                                    .cornerRadius(4)
                            }
                            if tool.userDefined {
                                Text("自定义")
                                    .font(.system(size: 10))
                                    .foregroundColor(.orange)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.orange.opacity(0.1))
                                    .cornerRadius(4)
                            }
                            Text("检测\(toolsViewModel.getDetectionCount(for: tool))次")
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                        }
                    }
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { tool.detectionEnabled },
                        set: { _ in
                            toolsViewModel.toggleTool(tool)
                            tool.detectionEnabled.toggle()
                        }
                    ))
                    .toggleStyle(.switch)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)

                // Matching Rules
                VStack(alignment: .leading, spacing: 12) {
                    Text("匹配规则")
                        .font(.headline)

                    // Bundle IDs
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Bundle ID")
                                .font(.system(size: 12, weight: .semibold))
                            ConfidenceBadge(confidence: tool.confidence.bundleId)
                        }
                        TextEditor(text: $editedBundleIds)
                            .font(.system(size: 12, design: .monospaced))
                            .frame(height: 60)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                            )
                            .onAppear {
                                editedBundleIds = tool.macosBundleIds.joined(separator: "\n")
                                editedAppNames = tool.macosAppNamePatterns.joined(separator: "\n")
                                editedTitlePatterns = tool.macosTitlePatterns.joined(separator: "\n")
                            }
                    }

                    // App Names
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("应用名称")
                                .font(.system(size: 12, weight: .semibold))
                            ConfidenceBadge(confidence: tool.confidence.appName)
                        }
                        TextEditor(text: $editedAppNames)
                            .font(.system(size: 12, design: .monospaced))
                            .frame(height: 60)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                            )
                    }

                    // Title Patterns
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("窗口标题匹配")
                                .font(.system(size: 12, weight: .semibold))
                            ConfidenceBadge(confidence: tool.confidence.title)
                        }
                        TextEditor(text: $editedTitlePatterns)
                            .font(.system(size: 12, design: .monospaced))
                            .frame(height: 60)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                            )
                    }

                    // Aliases
                    VStack(alignment: .leading, spacing: 4) {
                        Text("别名")
                            .font(.system(size: 12, weight: .semibold))
                        Text(tool.aliases.joined(separator: ", "))
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }

                    // Save Changes Button
                    Button("保存修改") {
                        let bundleIds = editedBundleIds.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                        let appNames = editedAppNames.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                        let titles = editedTitlePatterns.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                        toolsViewModel.updateToolRules(toolId: tool.id, bundleIds: bundleIds, appNames: appNames, titlePatterns: titles)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(.horizontal, 20)

                // Ignore Section
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("忽略规则")
                            .font(.headline)
                        Spacer()
                        Button(action: { showIgnoreSheet = true }) {
                            Label("添加忽略", systemImage: "plus")
                                .font(.system(size: 11))
                        }
                    }

                    Text("添加忽略规则后，该应用的Bundle ID或名称将被跳过检测")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 20)

                Spacer(minLength: 20)
            }
        }
        .sheet(isPresented: $showIgnoreSheet) {
            VStack(spacing: 0) {
                HStack {
                    Text("添加忽略规则")
                        .font(.title3)
                        .fontWeight(.bold)
                    Spacer()
                    Button("取消") { showIgnoreSheet = false }
                }
                .padding(20)

                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("忽略值")
                            .font(.system(size: 12, weight: .medium))
                        TextField("例如：com.example.app", text: $newIgnoreValue)
                            .textFieldStyle(.roundedBorder)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("原因（可选）")
                            .font(.system(size: 12, weight: .medium))
                        TextField("例如：不是AI工具", text: $newIgnoreReason)
                            .textFieldStyle(.roundedBorder)
                    }
                }
                .padding(.horizontal, 20)

                Spacer()

                HStack {
                    Button("取消") { showIgnoreSheet = false }
                    Spacer()
                    Button("添加") {
                        guard !newIgnoreValue.isEmpty else { return }
                        let type: String
                        if newIgnoreValue.contains(".") {
                            type = "bundle_id"
                        } else {
                            type = "app_name"
                        }
                        toolsViewModel.addIgnoredTarget(
                            type: type,
                            value: newIgnoreValue,
                            displayValue: newIgnoreValue,
                            reason: newIgnoreReason.isEmpty ? nil : newIgnoreReason
                        )
                        showIgnoreSheet = false
                        newIgnoreValue = ""
                        newIgnoreReason = ""
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(20)
            }
            .frame(width: 450, height: 300)
        }
    }
}
