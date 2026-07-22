import express from "express";
import {
  createTask,
  getAllTasks,
  getTaskById,
  updateTask,
  deleteTask,
  updateTaskStatus,
  addSubtask,
  getGanttData,
  getUpcomingReminders,
  startTask,
} from "../controllers/task.controller.js";
import {auth} from "../middlewares/auth.js";
const router = express.Router();


// Gantt & reminders
router.get("/gantt/data", getGanttData);
router.get("/reminders/upcoming", getUpcomingReminders);
router.patch("/:id/status", auth, updateTaskStatus);
router.patch("/:id/start", startTask);
router.post("/:taskId/subtasks", auth, addSubtask);
router.post("/", createTask); // Create Task
router.get("/", getAllTasks); // Get All Tasks
router.get("/:id", getTaskById); // Get Single Task
router.put("/:id", updateTask); // Update Task
router.delete("/:id", deleteTask); // Delete Task


export default router;
