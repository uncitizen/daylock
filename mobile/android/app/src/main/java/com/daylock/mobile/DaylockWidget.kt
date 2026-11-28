package com.daylock.mobile

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.widget.RemoteViews
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.*

class DaylockWidget : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    private fun updateAppWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val views = RemoteViews(context.packageName, R.layout.daylock_widget)
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val prefs = context.getSharedPreferences("DaylockPrefs", Context.MODE_PRIVATE)
                val apiUrl = prefs.getString("apiUrl", null)
                val apiKey = prefs.getString("apiKey", null)
                
                if (apiUrl != null && apiKey != null) {
                    val tasks = fetchMyDay(apiUrl, apiKey)
                    withContext(Dispatchers.Main) {
                        updateWidgetViews(context, views, tasks)
                        appWidgetManager.updateAppWidget(appWidgetId, views)
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        views.setTextViewText(R.id.widget_title, "Not configured")
                        appWidgetManager.updateAppWidget(appWidgetId, views)
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    views.setTextViewText(R.id.widget_title, "Error loading")
                    appWidgetManager.updateAppWidget(appWidgetId, views)
                }
            }
        }
    }

    private suspend fun fetchMyDay(apiUrl: String, apiKey: String): List<Task> {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val dateStr = dateFormat.format(Date())
        
        val url = URL("$apiUrl/api/v1/my-day?date=$dateStr")
        val connection = url.openConnection() as HttpURLConnection
        
        try {
            connection.requestMethod = "GET"
            connection.setRequestProperty("Authorization", "Bearer $apiKey")
            connection.setRequestProperty("Content-Type", "application/json")
            
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(response)
            val timeline = json.getJSONArray("timeline")
            
            val tasks = mutableListOf<Task>()
            val timeFormat = SimpleDateFormat("h:mm a", Locale.US)
            
            for (i in 0 until minOf(5, timeline.length())) {
                val item = timeline.getJSONObject(i)
                val title = item.getString("title")
                val startStr = item.optString("start", "")
                val time = if (startStr.isNotEmpty()) {
                    try {
                        val startDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).parse(startStr)
                        if (startDate != null) timeFormat.format(startDate) else ""
                    } catch (e: Exception) {
                        ""
                    }
                } else ""
                
                val listName = item.optString("listName", "")
                val streamColor = item.optString("streamColor", "#999999")
                
                tasks.add(Task(title, time, listName, streamColor))
            }
            
            return tasks
        } finally {
            connection.disconnect()
        }
    }

    private fun updateWidgetViews(context: Context, views: RemoteViews, tasks: List<Task>) {
        views.setTextViewText(R.id.widget_title, "My Day")
        
        val taskIds = listOf(
            R.id.task_1,
            R.id.task_2,
            R.id.task_3,
            R.id.task_4,
            R.id.task_5
        )
        
        val timeIds = listOf(
            R.id.task_1_time,
            R.id.task_2_time,
            R.id.task_3_time,
            R.id.task_4_time,
            R.id.task_5_time
        )
        
        val streamIds = listOf(
            R.id.task_1_stream,
            R.id.task_2_stream,
            R.id.task_3_stream,
            R.id.task_4_stream,
            R.id.task_5_stream
        )
        
        val indicatorIds = listOf(
            R.id.task_1_indicator,
            R.id.task_2_indicator,
            R.id.task_3_indicator,
            R.id.task_4_indicator,
            R.id.task_5_indicator
        )
        
        for (i in taskIds.indices) {
            if (i < tasks.size) {
                val task = tasks[i]
                views.setTextViewText(taskIds[i], task.title)
                views.setTextViewText(timeIds[i], task.time)
                views.setTextViewText(streamIds[i], task.stream)
                views.setInt(indicatorIds[i], "setBackgroundColor", Color.parseColor(task.color))
                views.setViewVisibility(taskIds[i], android.view.View.VISIBLE)
            } else {
                views.setViewVisibility(taskIds[i], android.view.View.GONE)
            }
        }
    }
}

data class Task(
    val title: String,
    val time: String,
    val stream: String,
    val color: String
)
