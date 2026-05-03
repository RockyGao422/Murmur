import SwiftUI

struct SessionRow: View {
    let session: DetectedSession
    var showActions: Bool = false
    var onComplete: (() -> Void)?
    var onIgnore: (() -> Void)?

    var body: some View {
        HStack(spacing: 12) {
            // Tool icon area
            VStack {
                Image(systemName: toolIconName)
                    .font(.system(size: 16))
                    .foregroundColor(.accentColor)
                    .frame(width: 32, height: 32)
                    .background(Color.accentColor.opacity(0.1))
                    .cornerRadius(8)
            }

            // Info area
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(session.toolName ?? "未知工具")
                        .font(.system(size: 13, weight: .semibold))
                    PlatformIcon(platform: session.sourcePlatform)
                    StatusBadge(status: session.status)
                }

                HStack(spacing: 8) {
                    Text(session.timeRangeFormatted)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                    Text(session.durationShortFormatted)
                        .font(.system(size: 11))
                        .foregroundColor(.blue)
                    ConfidenceBadge(confidence: session.confidence)
                }
            }

            Spacer()

            // Actions
            if showActions {
                HStack(spacing: 8) {
                    if session.status == .pending {
                        Button(action: { onComplete?() }) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                                .font(.system(size: 18))
                        }
                        .buttonStyle(.plain)
                        .help("补全")

                        Button(action: { onIgnore?() }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.gray)
                                .font(.system(size: 18))
                        }
                        .buttonStyle(.plain)
                        .help("忽略")
                    }

                    if session.status == .suspected {
                        Button(action: { onComplete?() }) {
                            Image(systemName: "checkmark.circle")
                                .foregroundColor(.orange)
                                .font(.system(size: 18))
                        }
                        .buttonStyle(.plain)
                        .help("确认")

                        Button(action: { onIgnore?() }) {
                            Image(systemName: "xmark.circle")
                                .foregroundColor(.gray)
                                .font(.system(size: 18))
                        }
                        .buttonStyle(.plain)
                        .help("忽略")
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var toolIconName: String {
        switch session.sourcePlatform {
        case .macos:
            return "desktopcomputer"
        case .browser:
            return "globe"
        case .android:
            return "iphone.gen1"
        }
    }
}

struct EntryRow: View {
    let entry: LedgerEntry

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(entry.toolName)
                        .font(.system(size: 13, weight: .semibold))
                    Text(entry.useCaseName)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Color.secondary.opacity(0.1))
                        .cornerRadius(4)
                }

                HStack(spacing: 8) {
                    Text(entry.quality.displayName)
                        .font(.system(size: 11))
                        .foregroundColor(qualityColor)
                    Text(entry.mood.displayName)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(entry.netGainFormatted)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(entry.netGainIsPositive ? .green : .red)
                Text("投入\(entry.extraCostFormatted)")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var qualityColor: Color {
        switch entry.quality {
        case .directUse: return .green
        case .minorEdit: return .blue
        case .majorEdit: return .orange
        case .useless: return .red
        }
    }
}
