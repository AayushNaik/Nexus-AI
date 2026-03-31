import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { db, auth } from "../lib/firebase";
import { collection, addDoc, query, where, getDocs, updateDoc, doc, deleteDoc, serverTimestamp } from "firebase/firestore";

// Tool Definitions
const taskTools: FunctionDeclaration = {
  name: "manage_tasks",
  description: "Create, list, update, or delete tasks.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["create", "list", "update", "delete"] },
      title: { type: Type.STRING },
      description: { type: Type.STRING },
      status: { type: Type.STRING, enum: ["todo", "in-progress", "completed"] },
      priority: { type: Type.STRING, enum: ["low", "medium", "high"] },
      dueDate: { type: Type.STRING, description: "The due date for the task in ISO 8601 format." },
      taskId: { type: Type.STRING }
    },
    required: ["action"]
  }
};

const noteTools: FunctionDeclaration = {
  name: "manage_notes",
  description: "Create, list, or delete notes.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["create", "list", "delete"] },
      content: { type: Type.STRING },
      noteId: { type: Type.STRING }
    },
    required: ["action"]
  }
};

const scheduleTools: FunctionDeclaration = {
  name: "manage_schedule",
  description: "Create, list, or delete schedule events.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: { type: Type.STRING, enum: ["create", "list", "delete"] },
      title: { type: Type.STRING },
      startTime: { type: Type.STRING },
      endTime: { type: Type.STRING },
      location: { type: Type.STRING },
      eventId: { type: Type.STRING }
    },
    required: ["action"]
  }
};

export async function executeAgentAction(prompt: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  // Initialize with the most up-to-date key (either selected via dialog or default)
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });

  const model = ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      systemInstruction: `You are Nexus, a multi-agent AI coordinator. 
      You help users manage their tasks, notes, and schedule.
      When a user asks to do something, use the appropriate tool.
      Always confirm the action you took.`,
      tools: [{ functionDeclarations: [taskTools, noteTools, scheduleTools] }]
    }
  });

  const response = await model;
  const functionCalls = response.functionCalls;

  if (functionCalls) {
    const results = [];
    for (const call of functionCalls) {
      const { name, args } = call;
      let result;

      if (name === "manage_tasks") {
        result = await handleTaskAction(args as any, user.uid);
      } else if (name === "manage_notes") {
        result = await handleNoteAction(args as any, user.uid);
      } else if (name === "manage_schedule") {
        result = await handleScheduleAction(args as any, user.uid);
      }
      results.push({ name, result });
    }

    // Send results back to model for final response
    const finalResponse = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        { role: "user", parts: [{ text: prompt }] },
        response.candidates[0].content, // Use the full original model content (includes thought signature)
        { role: "user", parts: results.map(r => ({ functionResponse: { name: r.name, response: { result: r.result } } })) }
      ]
    });
    return finalResponse.text;
  }

  return response.text;
}

async function handleTaskAction(args: any, userId: string) {
  const { action, title, description, status, priority, dueDate, taskId } = args;
  const tasksRef = collection(db, "tasks");

  switch (action) {
    case "create":
      const newDoc = await addDoc(tasksRef, {
        title,
        description: description || "",
        status: status || "todo",
        priority: priority || "medium",
        dueDate: dueDate || null,
        userId,
        createdAt: new Date().toISOString()
      });
      return { success: true, id: newDoc.id };
    case "list":
      const q = query(tasksRef, where("userId", "==", userId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    case "update":
      if (!taskId) return { error: "taskId required" };
      const updates: any = {};
      if (status) updates.status = status;
      if (priority) updates.priority = priority;
      if (dueDate) updates.dueDate = dueDate;
      await updateDoc(doc(db, "tasks", taskId), updates);
      return { success: true };
    case "delete":
      if (!taskId) return { error: "taskId required" };
      await deleteDoc(doc(db, "tasks", taskId));
      return { success: true };
  }
}

async function handleNoteAction(args: any, userId: string) {
  const { action, content, noteId } = args;
  const notesRef = collection(db, "notes");

  switch (action) {
    case "create":
      const newDoc = await addDoc(notesRef, {
        content,
        userId,
        createdAt: new Date().toISOString()
      });
      return { success: true, id: newDoc.id };
    case "list":
      const q = query(notesRef, where("userId", "==", userId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    case "delete":
      if (!noteId) return { error: "noteId required" };
      await deleteDoc(doc(db, "notes", noteId));
      return { success: true };
  }
}

async function handleScheduleAction(args: any, userId: string) {
  const { action, title, startTime, endTime, location, eventId } = args;
  const scheduleRef = collection(db, "schedules");

  switch (action) {
    case "create":
      const newDoc = await addDoc(scheduleRef, {
        title,
        startTime,
        endTime,
        location: location || "",
        userId,
        createdAt: new Date().toISOString()
      });
      return { success: true, id: newDoc.id };
    case "list":
      const q = query(scheduleRef, where("userId", "==", userId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    case "delete":
      if (!eventId) return { error: "eventId required" };
      await deleteDoc(doc(db, "schedules", eventId));
      return { success: true };
  }
}
