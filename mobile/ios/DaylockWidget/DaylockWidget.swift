import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), tasks: [
            Task(title: "Sample Task", time: "9:00 AM", stream: "Work", color: "#3b82f6")
        ])
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = SimpleEntry(date: Date(), tasks: [
            Task(title: "Sample Task", time: "9:00 AM", stream: "Work", color: "#3b82f6")
        ])
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        Task {
            do {
                let tasks = try await fetchMyDay()
                let entry = SimpleEntry(date: Date(), tasks: tasks)
                let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60 * 15)))
                completion(timeline)
            } catch {
                let entry = SimpleEntry(date: Date(), tasks: [], error: "Failed to load")
                let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60 * 5)))
                completion(timeline)
            }
        }
    }
    
    func fetchMyDay() async throws -> [Task] {
        guard let apiUrl = UserDefaults(suiteName: "group.com.daylock.mobile")?.string(forKey: "apiUrl"),
              let apiKey = UserDefaults(suiteName: "group.com.daylock.mobile")?.string(forKey: "apiKey") else {
            return []
        }
        
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let dateStr = dateFormatter.string(from: Date())
        
        guard let url = URL(string: "\(apiUrl)/api/v1/my-day?date=\(dateStr)") else {
            return []
        }
        
        var request = URLRequest(url: url)
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        
        let (data, _) = try await URLSession.shared.data(for: request)
        let response = try JSONDecoder().decode(MyDayResponse.self, from: data)
        
        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "h:mm a"
        
        return response.timeline.prefix(5).map { item in
            let time = item.start.map { date in
                timeFormatter.string(from: date)
            } ?? ""
            
            return Task(
                title: item.title,
                time: time,
                stream: item.listName ?? "",
                color: item.streamColor ?? "#999999"
            )
        }
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let tasks: [Task]
    var error: String? = nil
}

struct Task {
    let title: String
    let time: String
    let stream: String
    let color: String
}

struct MyDayResponse: Codable {
    let timeline: [TimelineItem]
}

struct TimelineItem: Codable {
    let title: String
    let start: Date?
    let listName: String?
    let streamColor: String?
}

struct DaylockWidgetEntryView : View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var widgetFamily

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("My Day")
                    .font(.system(.headline, design: .serif))
                    .fontWeight(.semibold)
                    .foregroundColor(Color(hex: "#1a1f1c"))
                Spacer()
                Text(entry.date, style: .time)
                    .font(.caption)
                    .foregroundColor(Color(hex: "#5c635c"))
            }
            .padding(.bottom, 4)
            
            if let error = entry.error {
                Text(error)
                    .font(.caption)
                    .foregroundColor(Color(hex: "#9f1239"))
            } else if entry.tasks.isEmpty {
                Text("No tasks for today")
                    .font(.caption)
                    .foregroundColor(Color(hex: "#5c635c"))
            } else {
                ForEach(entry.tasks.indices, id: \.self) { index in
                    TaskRow(task: entry.tasks[index])
                }
                Spacer()
            }
        }
        .padding()
        .background(Color(hex: "#f3f0e8"))
    }
}

struct TaskRow: View {
    let task: Task
    
    var body: some View {
        HStack(spacing: 0) {
            Rectangle()
                .fill(Color(hex: task.color))
                .frame(width: 4)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(Color(hex: "#1a1f1c"))
                    .lineLimit(1)
                
                HStack(spacing: 8) {
                    if !task.time.isEmpty {
                        Text(task.time)
                            .font(.caption2)
                            .foregroundColor(Color(hex: "#5c635c"))
                    }
                    if !task.stream.isEmpty {
                        Text(task.stream)
                            .font(.caption2)
                            .foregroundColor(Color(hex: "#5c635c"))
                            .fontWeight(.semibold)
                    }
                }
            }
            .padding(.leading, 12)
            .padding(.vertical, 8)
            Spacer()
        }
        .background(Color(hex: "#e8e4d9"))
        .cornerRadius(2)
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

@main
struct DaylockWidget: Widget {
    let kind: String = "DaylockWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            DaylockWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("My Day")
        .description("View your daily tasks and calendar")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct DaylockWidget_Previews: PreviewProvider {
    static var previews: some View {
        DaylockWidgetEntryView(entry: SimpleEntry(date: Date(), tasks: [
            Task(title: "Team Meeting", time: "9:00 AM", stream: "Work", color: "#3b82f6"),
            Task(title: "Lunch with Sarah", time: "12:00 PM", stream: "Personal", color: "#10b981"),
            Task(title: "Gym", time: "5:00 PM", stream: "Health", color: "#f59e0b")
        ]))
            .previewContext(WidgetPreviewContext(family: .systemMedium))
    }
}
