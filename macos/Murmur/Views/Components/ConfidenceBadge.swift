import SwiftUI

struct ConfidenceBadge: View {
    let confidence: Double

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(confidenceColor)
                .frame(width: 6, height: 6)
            Text(confidenceText)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(confidenceColor)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(confidenceColor.opacity(0.1))
        .cornerRadius(4)
    }

    private var confidenceColor: Color {
        if confidence >= 0.9 {
            return .green
        } else if confidence >= 0.7 {
            return .yellow
        } else {
            return .red
        }
    }

    private var confidenceText: String {
        if confidence >= 0.9 {
            return "高置信"
        } else if confidence >= 0.7 {
            return "中置信"
        } else {
            return "低置信"
        }
    }
}
