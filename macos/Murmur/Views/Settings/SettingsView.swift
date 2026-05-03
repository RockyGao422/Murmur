import SwiftUI
import AppKit

struct SettingsView: View {
    @EnvironmentObject var viewModel: SettingsViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("设置")
                    .font(.title2)
                    .fontWeight(.bold)
                    .padding(.horizontal, 20)
                    .padding(.top, 16)

                // Detection Section
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(title: "检测", icon: "antenna.radiowaves.left.and.right")

                    VStack(spacing: 12) {
                        // Toggle main detection
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("自动检测")
                                    .font(.system(size: 13, weight: .medium))
                                Text("自动检测前台AI应用的切换")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Toggle("", isOn: Binding(
                                get: { viewModel.detectionEnabled },
                                set: { _ in viewModel.toggleDetection() }
                            ))
                            .toggleStyle(.switch)
                        }
                        .padding(12)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)

                        // Status indicator
                        HStack {
                            DetectionStatusBadge(status: viewModel.detectionEnabled ? .running : .disabled)
                            Spacer()
                            if viewModel.detectionEnabled {
                                Text(viewModel.detectionStatusText)
                                    .font(.system(size: 12))
                                    .foregroundColor(.green)
                            }
                        }
                        .padding(.horizontal, 4)

                        // Window title detection
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("窗口标题检测")
                                    .font(.system(size: 13, weight: .medium))
                                Text("需要辅助功能权限，标题会哈希后存储")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Toggle("", isOn: Binding(
                                get: { viewModel.windowTitleDetectionEnabled },
                                set: { _ in viewModel.toggleWindowTitleDetection() }
                            ))
                            .toggleStyle(.switch)
                        }
                        .padding(12)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)

                        // Accessibility permission
                        if !viewModel.accessibilityGranted {
                            HStack {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundColor(.yellow)
                                Text("需要辅助功能权限才能读取窗口标题")
                                    .font(.system(size: 11))
                                Spacer()
                                Button("打开设置") {
                                    openAccessibilitySettings()
                                }
                                .font(.system(size: 11))
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            }
                            .padding(12)
                            .background(Color.yellow.opacity(0.05))
                            .cornerRadius(8)
                        }
                    }
                }
                .padding(.horizontal, 20)

                // Extension & Notification Section
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(title: "扩展与通知", icon: "app.connected.to.app.below.fill")

                    VStack(spacing: 12) {
                        // Browser Extension connection
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("浏览器扩展连接")
                                    .font(.system(size: 13, weight: .medium))
                                Text(viewModel.extensionConnected ? "已连接" : "未连接")
                                    .font(.system(size: 11))
                                    .foregroundColor(viewModel.extensionConnected ? .green : .secondary)
                            }
                            Spacer()
                            Circle()
                                .fill(viewModel.extensionConnected ? Color.green : Color.gray.opacity(0.3))
                                .frame(width: 8, height: 8)
                        }
                        .padding(12)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)

                        // Native Messaging
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("本地消息桥接")
                                    .font(.system(size: 13, weight: .medium))
                                Text("接收浏览器扩展发送的检测会话")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Toggle("", isOn: Binding(
                                get: { viewModel.nativeMessagingEnabled },
                                set: { _ in viewModel.toggleNativeMessaging() }
                            ))
                            .toggleStyle(.switch)
                        }
                        .padding(12)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)

                        // Notification toggle
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("待补全提醒")
                                    .font(.system(size: 13, weight: .medium))
                                Text("定时提醒补全检测到的 AI 会话")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Toggle("", isOn: Binding(
                                get: { viewModel.notificationsEnabled },
                                set: { _ in viewModel.toggleNotifications() }
                            ))
                            .toggleStyle(.switch)
                        }
                        .padding(12)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)

                        if !viewModel.notificationPermissionGranted && viewModel.notificationsEnabled {
                            HStack {
                                Image(systemName: "bell.badge.fill")
                                    .foregroundColor(.yellow)
                                Text("需要通知权限才能发送提醒")
                                    .font(.system(size: 11))
                                Spacer()
                                Button("授权") {
                                    Task { await viewModel.requestNotificationPermission() }
                                }
                                .font(.system(size: 11))
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                            }
                            .padding(12)
                            .background(Color.yellow.opacity(0.05))
                            .cornerRadius(8)
                        }
                    }
                }
                .padding(.horizontal, 20)

                // Data Section
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(title: "数据", icon: "internaldrive.fill")

                    VStack(spacing: 12) {
                        // Export CSV
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("导出CSV")
                                    .font(.system(size: 13, weight: .medium))
                                Text("导出所有检测会话和账本记录")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Button("导出") {
                                viewModel.exportCSV()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        .padding(12)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)

                        // Export Markdown
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("导出Markdown周报")
                                    .font(.system(size: 13, weight: .medium))
                                Text("生成可读的周报 .md 文件")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Button("导出") {
                                viewModel.exportMarkdown()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        .padding(12)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)

                        if let message = viewModel.exportSuccessMessage {
                            Text(message)
                                .font(.system(size: 11))
                                .foregroundColor(.green)
                                .padding(.horizontal, 4)
                        }

                        // Clear all data
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("清除所有数据")
                                    .font(.system(size: 13, weight: .medium))
                                Text("删除所有检测记录、账本和设置")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Button("清除数据") {
                                viewModel.showClearConfirmation = true
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .foregroundColor(.red)
                        }
                        .padding(12)
                        .background(Color(NSColor.controlBackgroundColor))
                        .cornerRadius(8)

                        // Confirmation dialog
                        if viewModel.showClearConfirmation {
                            HStack {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundColor(.red)
                                Text("确定要清除所有数据吗？此操作不可撤销。")
                                    .font(.system(size: 12, weight: .medium))
                                Spacer()
                                Button("取消") {
                                    viewModel.showClearConfirmation = false
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                Button("确认清除") {
                                    viewModel.clearAllData()
                                }
                                .buttonStyle(.borderedProminent)
                                .controlSize(.small)
                                .tint(.red)
                            }
                            .padding(12)
                            .background(Color.red.opacity(0.05))
                            .cornerRadius(8)
                        }
                    }
                }
                .padding(.horizontal, 20)

                // Privacy Section
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(title: "隐私", icon: "hand.raised.fill")

                    VStack(spacing: 8) {
                        Text("Murmur 所有数据均存储在本地，不会上传到任何服务器。")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)

                        Text("窗口标题在存储前会进行SHA256哈希处理，原始标题不会被保存。")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)

                        Text("Prompt内容和AI输出内容不会被采集。")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)

                        // Pause controls
                        HStack(spacing: 12) {
                            Button("暂停1小时") {
                                viewModel.pauseDetection(durationHours: 1)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)

                            Button("暂停到明天") {
                                let calendar = Calendar.current
                                let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date())!
                                let startOfTomorrow = calendar.startOfDay(for: tomorrow)
                                let hoursUntil = startOfTomorrow.timeIntervalSinceNow / 3600
                                viewModel.pauseDetection(durationHours: hoursUntil)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)

                            Button("恢复检测") {
                                viewModel.resumeDetection()
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                    }
                    .padding(12)
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(8)
                }
                .padding(.horizontal, 20)

                // About Section
                VStack(alignment: .leading, spacing: 12) {
                    SectionHeader(title: "关于", icon: "info.circle.fill")

                    VStack(spacing: 6) {
                        HStack {
                            Text("版本")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(viewModel.appVersion)
                                .font(.system(size: 12, weight: .medium))
                        }
                        Divider()
                        HStack {
                            Text("Murmur")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                            Spacer()
                            Text("本地优先的AI使用追踪工具")
                                .font(.system(size: 12))
                        }
                    }
                    .padding(12)
                    .background(Color(NSColor.controlBackgroundColor))
                    .cornerRadius(8)
                }
                .padding(.horizontal, 20)

                Spacer(minLength: 20)
            }
        }
    }

    private func openAccessibilitySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }
}

// MARK: - Section Header

struct SectionHeader: View {
    let title: String
    let icon: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundColor(.accentColor)
            Text(title)
                .font(.system(size: 14, weight: .semibold))
        }
    }
}
