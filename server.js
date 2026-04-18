const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("后端已经运行成功！");
});

// 解析 event-stream
function parseEventStream(rawText) {
  const blocks = rawText.split("\n\n");
  const events = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    let eventName = "";
    let dataText = "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.replace("event:", "").trim();
      }
      if (line.startsWith("data:")) {
        dataText += line.replace("data:", "").trim();
      }
    }

    if (!dataText) continue;

    try {
      const json = JSON.parse(dataText);
      events.push({
        event: eventName,
        data: json
      });
    } catch (e) {
      events.push({
        event: eventName,
        data: dataText
      });
    }
  }

  return events;
}

app.post("/api/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "";

    const payload = {
      content: {
        query: {
          prompt: [
            {
              type: "text",
              content: {
                text: userMessage
              }
            }
          ]
        }
      },
      type: "query",
      session_id: process.env.COZE_SESSION_ID,
      project_id: Number(process.env.COZE_PROJECT_ID)
    };

    const response = await fetch(process.env.COZE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.COZE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const rawText = await response.text();
    const events = parseEventStream(rawText);

    let finalAnswer = "";
    let finalToolResult = null;
    const toolSteps = [];

    for (const item of events) {
      const data = item.data;

      if (!data || typeof data !== "object") continue;
      if (!data.content) continue;

      // 提取最终答案
      if (data.content.answer && typeof data.content.answer === "string") {
        finalAnswer += data.content.answer;
      }

      // 提取工具调用信息
      if (data.content.tool_request) {
        toolSteps.push({
          type: "tool_request",
          tool_name: data.content.tool_request.tool_name,
          parameters: data.content.tool_request.parameters
        });
      }

      // 提取工具返回信息
      if (data.content.tool_response) {
  finalToolResult = data.content.tool_response;

  toolSteps.push({
    type: "tool_response",
    result: data.content.tool_response
  });
}
    }

    res.json({
  success: response.ok,
  status: response.status,
  answer: finalAnswer,
  toolResult: finalToolResult,
  toolSteps: toolSteps,
  eventsCount: events.length
});
  } catch (error) {
    console.error("调用扣子 API 失败：", error);

    res.status(500).json({
      success: false,
      error: String(error)
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`服务器已经启动：http://localhost:${PORT}`);
});