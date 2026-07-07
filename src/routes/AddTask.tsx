import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TaskForm } from "../components/TaskForm";
import { useToast } from "../components/Toast";
import { Card, PageHeader } from "../components/ui";
import { db } from "../data/db";
import { addSubtasks, addTask, type TaskDraft } from "../data/repo";
import { generateSubtasks } from "../logic/breakdown";

export function AddTask() {
  const [autoBreak, setAutoBreak] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  async function save(draft: TaskDraft) {
    const id = await addTask(draft);
    let withSteps = false;
    if (autoBreak && draft.estimatedMinutes > 25) {
      const task = await db.tasks.get(id);
      if (task) {
        await addSubtasks(generateSubtasks(task));
        withSteps = true;
      }
    }
    toast(withSteps ? "Added — broken into steps" : "Added to your tasks");
    navigate("/tasks");
  }

  return (
    <div className="space-y-5 lg:mx-auto lg:max-w-2xl">
      <PageHeader
        title="Add task"
        subtitle="A rough version now beats a perfect version never."
      />
      <Card>
        <TaskForm onSubmit={save} submitLabel="Add to my tasks" />
        <label className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-4">
          <span>
            <span className="font-medium">Break into steps automatically</span>
            <span className="block text-[0.9rem] text-soft">
              Bigger tasks get a ready-made step list you can edit.
            </span>
          </span>
          <input
            type="checkbox"
            className="toggle"
            checked={autoBreak}
            onChange={(e) => setAutoBreak(e.target.checked)}
          />
        </label>
      </Card>
    </div>
  );
}
