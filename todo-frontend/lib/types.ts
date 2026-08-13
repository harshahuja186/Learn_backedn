export type Priority = "low" | "medium" | "high";
export type TodoTag = "work" | "personal" | "urgent" | "others";

export type Todo = {
  _id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: Priority;
  userId: string;
  tags: TodoTag[];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type TodoInput = {
  title: string;
  description: string;
  priority: Priority;
  tags: TodoTag[];
  dueDate?: string;
  completed?: boolean;
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export type TodosResponse = {
  success: boolean;
  source?: string;
  count: number;
  total: number;
  totalPages: number;
  data: Todo[];
  error?: string;
};

export type ApiError = {
  success: false;
  error: string;
  message?: string;
};
