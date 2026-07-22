import Task from "../models/task.model.js";

/**
 * CREATE TASK
 */
export const createTask = async (req, res) => {
  try {
    const { title, description, priority, assignedTo, deadline,status,projectId,startDate,
      endDate,
      dependencies,
      reminderAt  } = req.body;

    const task = await Task.create({
      title,
      description,
      priority,
      assignedTo,
      deadline,
      status: status || "TODO",
      projectId , startDate,
      endDate,
      dependencies: dependencies || [],
      reminderAt: reminderAt || deadline
    }); 
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET ALL TASKS
 */
export const getAllTasks = async (req, res) => {
  try {
    const tasks = await Task.find();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * GET SINGLE TASK
 */
export const getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * UPDATE TASK 
 */
export const updateTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * DELETE TASK
 */
export const deleteTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({ message: "Task deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
/**
 * UPDATE TASK STATUS
 * Only assigned user or admin can update status
 */
export const updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id: userId, role } = req.user; 

    const allowedStatus = ["TODO", "IN_PROGRESS", "DONE"];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (role !== "admin" && task.assignedTo !== userId) {
      return res.status(403).json({
        message: "Not authorized to update task status",
      });
    }

    task.status = status;
    await task.save();

    res.json({
      message: "Task status updated successfully",
      task,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

  export const addSubtask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { title } = req.body;

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    task.subtasks.push({ title });
    await task.save();

    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getGanttData = async (req, res) => {
  try {
    const { projectId } = req.query;

    const tasks = await Task.find({ projectId, startDate: { $ne: null }, endDate: { $ne: null } });

    const ganttTasks = tasks.map(task => ({
      id: task._id.toString(),
      name: task.title,
      start: task.startDate.toISOString().split("T")[0], 
      end: task.endDate.toISOString().split("T")[0],
      progress: task.status === "DONE" ? 100 : 0
    }));

    res.json(ganttTasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getUpcomingReminders = async (req, res) => {
  try {
    const now = new Date();
    const upcoming = new Date();
    upcoming.setDate(now.getDate() + 3); // next 3 days

    const tasks = await Task.find({
      status: { $ne: "DONE" },
      $or: [
        { reminderAt: { $gte: now, $lte: upcoming } },
        { reminderAt: null, deadline: { $gte: now, $lte: upcoming } } // fallback to deadline
      ]
    });

    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const startTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate("dependencies");

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const blocked = task.dependencies?.some(
      (dep) => dep.status !== "DONE"
    );

    if (blocked) {
      return res.status(400).json({
        message: "Cannot start task. Dependencies not completed.",
      });
    }

    task.status = "IN_PROGRESS";
    await task.save();

    res.json(task);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
