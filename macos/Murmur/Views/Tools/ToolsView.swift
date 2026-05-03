import SwiftUI

struct ToolsView: View {
    @EnvironmentObject var viewModel: ToolsViewModel
    @State private var searchText: String = ""
    @State private var showAddToolSheet: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("工具管理")
                    .font(.title2)
                    .fontWeight(.bold)
                Spacer()
                Button(action: { showAddToolSheet = true }) {
                    Label("添加工具", systemImage: "plus")
                        .font(.system(size: 12))
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 8)

            // Search bar
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                TextField("搜索工具...", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                if !searchText.isEmpty {
                    Button(action: { searchText = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(8)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(8)
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
            .onChange(of: searchText) { newValue in
                viewModel.searchQuery = newValue
            }

            // Tool list
            List {
                ForEach(viewModel.filteredTools) { tool in
                    NavigationLink(destination: ToolDetailView(tool: tool)) {
                        ToolRowView(tool: tool, detectionCount: viewModel.getDetectionCount(for: tool))
                    }
                }
            }
            .listStyle(.inset)
        }
        .onAppear {
            viewModel.loadTools()
        }
        .sheet(isPresented: $showAddToolSheet) {
            AddToolView { name, bundleIds, appNames, titlePatterns in
                _ = viewModel.addTool(name: name, bundleIds: bundleIds, appNames: appNames, titlePatterns: titlePatterns)
                showAddToolSheet = false
            }
        }
    }
}

// MARK: - Tool Row View

struct ToolRowView: View {
    let tool: ToolCatalogItem
    let detectionCount: Int

    var body: some View {
        HStack(spacing: 12) {
            // Tool icon
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.accentColor.opacity(0.1))
                    .frame(width: 32, height: 32)
                Text(String(tool.name.prefix(1)))
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.accentColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(tool.name)
                        .font(.system(size: 13, weight: .semibold))
                    if tool.userDefined {
                        Text("自定义")
                            .font(.system(size: 9))
                            .foregroundColor(.blue)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.blue.opacity(0.1))
                            .cornerRadius(3)
                    }
                }

                HStack(spacing: 8) {
                    Text("检测\(detectionCount)次")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                    if !tool.macosBundleIds.isEmpty {
                        Text("BundleID匹配")
                            .font(.system(size: 10))
                            .foregroundColor(.green)
                    }
                }
            }

            Spacer()

            // Enabled toggle
            Toggle("", isOn: Binding(
                get: { tool.detectionEnabled },
                set: { _ in
                    // Toggle will be handled by parent
                }
            ))
            .toggleStyle(.switch)
            .scaleEffect(0.8)
            .onTapGesture {
                // Toggle through viewModel
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Add Tool View

struct AddToolView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name: String = ""
    @State private var bundleIds: String = ""
    @State private var appNames: String = ""
    @State private var titlePatterns: String = ""
    @State private var validationMessage: String?

    let onAdd: (String, [String], [String], [String]) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("添加自定义工具")
                    .font(.title3)
                    .fontWeight(.bold)
                Spacer()
                Button("取消") { dismiss() }
            }
            .padding(20)

            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("工具名称 *")
                        .font(.system(size: 12, weight: .medium))
                    TextField("例如：MyAI", text: $name)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Bundle ID（逗号分隔）")
                        .font(.system(size: 12, weight: .medium))
                    TextField("例如：com.example.app", text: $bundleIds)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("应用名称（逗号分隔）")
                        .font(.system(size: 12, weight: .medium))
                    TextField("例如：MyAI, MyAI Pro", text: $appNames)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("窗口标题匹配（逗号分隔）")
                        .font(.system(size: 12, weight: .medium))
                    TextField("例如：MyAI, Chat", text: $titlePatterns)
                        .textFieldStyle(.roundedBorder)
                }

                if let message = validationMessage {
                    Text(message)
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                }
            }
            .padding(.horizontal, 20)

            Spacer()

            HStack {
                Button("取消") { dismiss() }
                Spacer()
                Button("添加") {
                    guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
                        validationMessage = "请输入工具名称"
                        return
                    }
                    let bidList = bundleIds.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                    let nameList = appNames.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                    let titleList = titlePatterns.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                    onAdd(name.trimmingCharacters(in: .whitespaces), bidList, nameList, titleList)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(20)
        }
        .frame(width: 500, height: 400)
    }
}
