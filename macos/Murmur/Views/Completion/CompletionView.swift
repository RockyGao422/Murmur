import SwiftUI

struct CompletionView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var storageManager: StorageManager

    let session: DetectedSession
    @StateObject private var viewModel: CompletionViewModel
    @State private var animateSave: Bool = false

    init(session: DetectedSession) {
        self.session = session
        _viewModel = StateObject(wrappedValue: CompletionViewModel(
            session: session,
            storageManager: StorageManager()
        ))
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("补全会话")
                    .font(.title3)
                    .fontWeight(.bold)
                Spacer()
                Button("取消") {
                    viewModel.cancel()
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 8)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Auto-filled Info Section
                    VStack(alignment: .leading, spacing: 8) {
                        Text("自动检测信息")
                            .font(.headline)
                            .foregroundColor(.secondary)

                        VStack(spacing: 8) {
                            InfoRow(label: "工具", value: viewModel.toolName)
                            InfoRow(label: "平台", value: viewModel.platformName)
                            InfoRow(label: "时间", value: viewModel.timeRange)
                            InfoRow(label: "时长", value: viewModel.duration)
                            InfoRow(label: "日期", value: viewModel.localDate)
                        }
                        .padding(12)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)
                    }

                    // User Input Section
                    VStack(alignment: .leading, spacing: 16) {
                        Text("补全信息")
                            .font(.headline)
                            .foregroundColor(.secondary)

                        // Use Case Picker
                        VStack(alignment: .leading, spacing: 4) {
                            Text("使用场景")
                                .font(.system(size: 12, weight: .medium))
                            Picker("", selection: Binding(
                                get: { viewModel.useCaseId },
                                set: { id in
                                    if let useCase = UseCaseCategory.allCases.first(where: { $0.rawValue == id }) {
                                        viewModel.setUseCase(id, name: useCase.displayName)
                                    }
                                }
                            )) {
                                ForEach(UseCaseCategory.allCases, id: \.rawValue) { useCase in
                                    Text(useCase.displayName).tag(useCase.rawValue)
                                }
                            }
                            .labelsHidden()
                        }

                        // Time Fields
                        VStack(alignment: .leading, spacing: 8) {
                            Text("时间估算（分钟）")
                                .font(.system(size: 12, weight: .medium))

                            HStack(spacing: 12) {
                                TimeField(label: "预估节省", value: $viewModel.estimatedSavedMinutes)
                                TimeField(label: "写Prompt", value: $viewModel.promptMinutes)
                                TimeField(label: "检查结果", value: $viewModel.reviewMinutes)
                            }
                            HStack(spacing: 12) {
                                TimeField(label: "编辑修改", value: $viewModel.editMinutes)
                                TimeField(label: "调试修复", value: $viewModel.debugMinutes)
                                TimeField(label: "返工重做", value: $viewModel.reworkMinutes)
                            }
                        }

                        // Quality Picker
                        VStack(alignment: .leading, spacing: 4) {
                            Text("输出质量")
                                .font(.system(size: 12, weight: .medium))
                            Picker("", selection: $viewModel.quality) {
                                ForEach(OutputQuality.allCases, id: \.self) { quality in
                                    Text(quality.displayName).tag(quality)
                                }
                            }
                            .labelsHidden()
                        }

                        // Mood Picker
                        VStack(alignment: .leading, spacing: 4) {
                            Text("使用感受")
                                .font(.system(size: 12, weight: .medium))
                            Picker("", selection: $viewModel.mood) {
                                ForEach(UserMood.allCases, id: \.self) { mood in
                                    Text(mood.displayName).tag(mood)
                                }
                            }
                            .labelsHidden()
                        }

                        // Note
                        VStack(alignment: .leading, spacing: 4) {
                            Text("备注（可选）")
                                .font(.system(size: 12, weight: .medium))
                            TextEditor(text: $viewModel.note)
                                .font(.system(size: 13))
                                .frame(height: 60)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
                                )
                        }
                    }
                }
                .padding(.horizontal, 20)
            }

            // Bottom bar with summary and save
            VStack(spacing: 8) {
                Divider()

                if let message = viewModel.validationMessage {
                    Text(message)
                        .font(.system(size: 12))
                        .foregroundColor(.red)
                        .padding(.horizontal, 20)
                }

                // Preview
                HStack {
                    Text("额外成本: \(viewModel.extraCostTotal)分钟")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("净收益: \(viewModel.netGainPreviewFormatted)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(viewModel.isNetGainPositive ? .green : .red)
                }
                .padding(.horizontal, 20)

                HStack {
                    Button("取消") {
                        dismiss()
                    }
                    .keyboardShortcut(.cancelAction)

                    Spacer()

                    Button(action: {
                        viewModel.save()
                        if viewModel.isSaved {
                            withAnimation(.easeInOut(duration: 0.3)) {
                                animateSave = true
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                                dismiss()
                            }
                        }
                    }) {
                        HStack {
                            if viewModel.isSaving {
                                ProgressView()
                                    .scaleEffect(0.7)
                                    .frame(width: 14, height: 14)
                            }
                            Text(viewModel.isSaved ? "已保存" : "保存")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(viewModel.isSaving || viewModel.isSaved)
                    .keyboardShortcut(.return)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
            }
        }
        .frame(width: 600, height: 700)
        .onAppear {
            viewModel.onCancel = { dismiss() }
        }
    }
}

// MARK: - Info Row

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .frame(width: 60, alignment: .leading)
            Text(value)
                .font(.system(size: 13, weight: .medium))
            Spacer()
        }
    }
}

// MARK: - Time Field

struct TimeField: View {
    let label: String
    @Binding var value: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
            HStack(spacing: 0) {
                Button(action: { value = max(0, value - 1) }) {
                    Image(systemName: "minus")
                        .font(.system(size: 10))
                }
                .buttonStyle(.plain)
                .frame(width: 20, height: 24)
                .background(Color.secondary.opacity(0.1))

                TextField("", value: $value, format: .number)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13, weight: .medium))
                    .frame(width: 30)
                    .multilineTextAlignment(.center)

                Button(action: { value += 1 }) {
                    Image(systemName: "plus")
                        .font(.system(size: 10))
                }
                .buttonStyle(.plain)
                .frame(width: 20, height: 24)
                .background(Color.secondary.opacity(0.1))
            }
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .stroke(Color.secondary.opacity(0.3), lineWidth: 1)
            )
        }
    }
}
