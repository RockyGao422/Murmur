import Foundation

enum SourcePlatform: String, Codable, CaseIterable {
    case macos
    case android
    case browser

    var displayName: String {
        switch self {
        case .macos: return "macOS"
        case .android: return "Android"
        case .browser: return "浏览器"
        }
    }

    var sfSymbol: String {
        switch self {
        case .macos: return "desktopcomputer"
        case .android: return "iphone.gen1"
        case .browser: return "globe"
        }
    }
}

enum SourceKind: String, Codable, CaseIterable {
    case app
    case web

    var displayName: String {
        switch self {
        case .app: return "桌面应用"
        case .web: return "网页"
        }
    }
}

enum SessionStatus: String, Codable, CaseIterable {
    case pending
    case completed
    case ignored
    case merged
    case suspected

    var displayName: String {
        switch self {
        case .pending: return "待补全"
        case .completed: return "已完成"
        case .ignored: return "已忽略"
        case .merged: return "已合并"
        case .suspected: return "疑似"
        }
    }

    var badgeColor: String {
        switch self {
        case .pending: return "yellow"
        case .completed: return "green"
        case .ignored: return "gray"
        case .merged: return "blue"
        case .suspected: return "orange"
        }
    }
}

enum OutputQuality: String, Codable, CaseIterable {
    case directUse = "direct_use"
    case minorEdit = "minor_edit"
    case majorEdit = "major_edit"
    case useless = "useless"

    var displayName: String {
        switch self {
        case .directUse: return "直接可用"
        case .minorEdit: return "小改可用"
        case .majorEdit: return "大改才可用"
        case .useless: return "完全没用"
        }
    }

    var score: Int {
        switch self {
        case .directUse: return 4
        case .minorEdit: return 3
        case .majorEdit: return 2
        case .useless: return 1
        }
    }

    var penalty: Int {
        switch self {
        case .directUse: return 0
        case .minorEdit: return 4
        case .majorEdit: return 9
        case .useless: return 14
        }
    }
}

enum UserMood: String, Codable, CaseIterable {
    case easy
    case neutral
    case irritated
    case tired
    case anxious

    var displayName: String {
        switch self {
        case .easy: return "轻松"
        case .neutral: return "一般"
        case .irritated: return "烦躁"
        case .tired: return "疲惫"
        case .anxious: return "焦虑"
        }
    }

    var weight: Int {
        switch self {
        case .easy: return 0
        case .neutral: return 2
        case .irritated: return 6
        case .tired: return 8
        case .anxious: return 10
        }
    }
}

enum DetectionStatus: String, Codable {
    case running
    case paused
    case disabled

    var displayName: String {
        switch self {
        case .running: return "检测中"
        case .paused: return "已暂停"
        case .disabled: return "已关闭"
        }
    }

    var badgeColor: String {
        switch self {
        case .running: return "green"
        case .paused: return "yellow"
        case .disabled: return "red"
        }
    }
}

enum EventType: String, Codable {
    case foreground
    case background
    case tabActive = "tab_active"
    case tabInactive = "tab_inactive"
    case navigation
    case idle
    case close
}

// Use case categories
enum UseCaseCategory: String, CaseIterable {
    case codeGeneration = "code_generation"
    case codeReview = "code_review"
    case debugging = "debugging"
    case contentWriting = "content_writing"
    case contentTranslation = "content_translation"
    case research = "research"
    case learning = "learning"
    case creative = "creative"
    case other = "other"

    var displayName: String {
        switch self {
        case .codeGeneration: return "代码生成"
        case .codeReview: return "代码审查"
        case .debugging: return "调试排错"
        case .contentWriting: return "内容写作"
        case .contentTranslation: return "内容翻译"
        case .research: return "研究调研"
        case .learning: return "学习理解"
        case .creative: return "创意生成"
        case .other: return "其他"
        }
    }
}
