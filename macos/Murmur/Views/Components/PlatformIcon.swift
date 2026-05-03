import SwiftUI

struct PlatformIcon: View {
    let platform: SourcePlatform

    var body: some View {
        Image(systemName: platform.sfSymbol)
            .font(.system(size: 12))
            .foregroundColor(platformColor)
            .frame(width: 20, height: 20)
            .background(platformColor.opacity(0.1))
            .cornerRadius(4)
    }

    private var platformColor: Color {
        switch platform {
        case .macos: return .blue
        case .android: return .green
        case .browser: return .orange
        }
    }
}

struct StatusBadge: View {
    let status: SessionStatus

    var body: some View {
        Text(status.displayName)
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(statusColor)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(statusColor.opacity(0.1))
            .cornerRadius(4)
    }

    private var statusColor: Color {
        switch status {
        case .pending: return .yellow
        case .completed: return .green
        case .ignored: return .gray
        case .merged: return .blue
        case .suspected: return .orange
        }
    }
}

struct DetectionStatusBadge: View {
    let status: DetectionStatus

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(status.displayName)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(statusColor)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(statusColor.opacity(0.1))
        .cornerRadius(6)
    }

    private var statusColor: Color {
        switch status {
        case .running: return .green
        case .paused: return .yellow
        case .disabled: return .red
        }
    }
}
