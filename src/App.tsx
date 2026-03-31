import React, { useState, useEffect, useRef } from 'react';
import { auth, db, isFirebaseConfigured, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  CheckSquare, 
  Calendar, 
  StickyNote, 
  MessageSquare, 
  Send, 
  Plus, 
  LogOut, 
  User as UserIcon,
  Clock,
  AlertCircle,
  ChevronRight,
  Loader2,
  Trash2,
  Edit2,
  CheckCircle2,
  X,
  MapPin,
  Settings as SettingsIcon,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast, Toaster } from 'sonner';
import { cn } from './lib/utils';
import { Task, Note, Schedule, AgentMessage, TaskStatus, Priority } from './types';
import { executeAgentAction } from './services/geminiService';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'schedule' | 'notes' | 'chat' | 'settings'>('dashboard');
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>(() => {
    const saved = localStorage.getItem('nexus_chat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  useEffect(() => {
    localStorage.setItem('nexus_chat_history', JSON.stringify(messages));
  }, [messages]);
  
  // Modal States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isFirebaseConfigured) return;

    const qTasks = query(collection(db, 'tasks'), where('userId', '==', user.uid));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'tasks'));

    const qNotes = query(collection(db, 'notes'), where('userId', '==', user.uid));
    const unsubNotes = onSnapshot(qNotes, (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'notes'));

    const qSchedules = query(collection(db, 'schedules'), where('userId', '==', user.uid));
    const unsubSchedules = onSnapshot(qSchedules, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'schedules'));

    return () => {
      unsubTasks();
      unsubNotes();
      unsubSchedules();
    };
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  // Manual CRUD Handlers
  const handleSaveTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const taskData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      status: formData.get('status') as TaskStatus,
      priority: formData.get('priority') as Priority,
      dueDate: formData.get('dueDate') as string || null,
      userId: user.uid,
      createdAt: editingItem?.createdAt || new Date().toISOString()
    };

    try {
      if (editingItem?.id) {
        await updateDoc(doc(db, 'tasks', editingItem.id), taskData);
        toast.success('Task updated');
      } else {
        await addDoc(collection(db, 'tasks'), taskData);
        toast.success('Task created');
      }
      setIsTaskModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, editingItem?.id ? OperationType.UPDATE : OperationType.CREATE, 'tasks');
      toast.error('Failed to save task');
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
      toast.success('Task deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${id}`);
      toast.error('Failed to delete task');
    }
  };

  const handleToggleTaskStatus = async (task: Task) => {
    const newStatus: TaskStatus = task.status === 'completed' ? 'todo' : 'completed';
    try {
      await updateDoc(doc(db, 'tasks', task.id!), { status: newStatus });
      toast.success(`Task marked as ${newStatus}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${task.id}`);
      toast.error('Failed to update task');
    }
  };

  const handleSaveNote = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const noteData = {
      content: formData.get('content') as string,
      userId: user.uid,
      createdAt: editingItem?.createdAt || new Date().toISOString()
    };

    try {
      if (editingItem?.id) {
        await updateDoc(doc(db, 'notes', editingItem.id), noteData);
        toast.success('Note updated');
      } else {
        await addDoc(collection(db, 'notes'), noteData);
        toast.success('Note created');
      }
      setIsNoteModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, editingItem?.id ? OperationType.UPDATE : OperationType.CREATE, 'notes');
      toast.error('Failed to save note');
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notes', id));
      toast.success('Note deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notes/${id}`);
      toast.error('Failed to delete note');
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const scheduleData = {
      title: formData.get('title') as string,
      startTime: formData.get('startTime') as string,
      endTime: formData.get('endTime') as string,
      location: formData.get('location') as string || "",
      userId: user.uid,
      createdAt: editingItem?.createdAt || new Date().toISOString()
    };

    try {
      if (editingItem?.id) {
        await updateDoc(doc(db, 'schedules', editingItem.id), scheduleData);
        toast.success('Event updated');
      } else {
        await addDoc(collection(db, 'schedules'), scheduleData);
        toast.success('Event created');
      }
      setIsScheduleModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, editingItem?.id ? OperationType.UPDATE : OperationType.CREATE, 'schedules');
      toast.error('Failed to save event');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'schedules', id));
      toast.success('Event deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `schedules/${id}`);
      toast.error('Failed to delete event');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg: AgentMessage = { role: 'user', content: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await executeAgentAction(input);
      const aiMsg: AgentMessage = { role: 'assistant', content: response, timestamp: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error("Agent execution failed", error);
      const errorMsg: AgentMessage = { role: 'system', content: "Sorry, I encountered an error. Please try again.", timestamp: Date.now() };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#151619] border border-[#F27D26]/20 rounded-2xl p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-[#F27D26]/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-[#F27D26]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Firebase Setup Required</h1>
            <p className="text-gray-400 text-sm">
              Nexus AI requires a Firebase project to store your data and manage authentication.
            </p>
          </div>
          <div className="bg-black/40 rounded-xl p-4 text-left space-y-3 border border-white/5">
            <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">Setup Instructions</p>
            <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
              <li>Open the Firebase setup UI in the agent chat.</li>
              <li>Accept the terms and provision a new project.</li>
              <li>The app will automatically refresh once configured.</li>
            </ol>
          </div>
          <p className="text-xs text-gray-500">
            Current Error: <span className="text-[#F27D26] font-mono">auth/invalid-api-key</span>
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#F27D26] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <h1 className="text-6xl font-bold text-white mb-6 tracking-tighter uppercase font-display">
            Nexus <span className="text-[#F27D26]">AI</span>
          </h1>
          <p className="text-gray-400 mb-8 text-lg">
            Coordinate your life with a multi-agent AI system. 
            Tasks, schedules, and notes, all in one place.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full bg-[#F27D26] hover:bg-[#d66a1d] text-white font-bold py-4 px-8 rounded-full transition-all transform hover:scale-105 flex items-center justify-center gap-3"
          >
            <UserIcon className="w-5 h-5" />
            Connect with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex">
      {/* Sidebar */}
      <aside className="w-20 md:w-64 border-r border-white/10 flex flex-col bg-[#0a0a0a]">
        <div className="p-6">
          <h2 className="text-2xl font-bold tracking-tighter hidden md:block">NEXUS</h2>
          <div className="w-8 h-8 bg-[#F27D26] rounded-sm md:hidden" />
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          <NavItem 
            icon={<LayoutDashboard />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <NavItem 
            icon={<CheckSquare />} 
            label="Tasks" 
            active={activeTab === 'tasks'} 
            onClick={() => setActiveTab('tasks')} 
          />
          <NavItem 
            icon={<Calendar />} 
            label="Schedule" 
            active={activeTab === 'schedule'} 
            onClick={() => setActiveTab('schedule')} 
          />
          <NavItem 
            icon={<StickyNote />} 
            label="Notes" 
            active={activeTab === 'notes'} 
            onClick={() => setActiveTab('notes')} 
          />
          <NavItem 
            icon={<MessageSquare />} 
            label="AI Chat" 
            active={activeTab === 'chat'} 
            onClick={() => setActiveTab('chat')} 
          />
          <NavItem 
            icon={<SettingsIcon />} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer group" onClick={handleLogout}>
            <div className="w-8 h-8 rounded-full bg-[#F27D26] flex items-center justify-center overflow-hidden">
              {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <UserIcon className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0 hidden md:block">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-gray-500 truncate">Sign out</p>
            </div>
            <LogOut className="w-4 h-4 text-gray-500 group-hover:text-white hidden md:block" />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-bottom border-white/10 flex items-center justify-between px-8 bg-[#0a0a0a]/50 backdrop-blur-xl">
          <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">
            {activeTab}
          </h3>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                setEditingItem(null);
                if (activeTab === 'tasks') setIsTaskModalOpen(true);
                else if (activeTab === 'notes') setIsNoteModalOpen(true);
                else if (activeTab === 'schedule') setIsScheduleModalOpen(true);
                else setActiveTab('chat');
              }}
              className="p-2 rounded-full bg-[#F27D26] hover:bg-[#d66a1d] text-white transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 relative">
          <Toaster position="top-right" theme="dark" />
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                <DashboardCard 
                  title="Pending Tasks" 
                  value={tasks.filter(t => t.status !== 'completed').length} 
                  icon={<CheckSquare className="text-[#F27D26]" />}
                  items={tasks.filter(t => t.status !== 'completed').slice(0, 3).map(t => t.title)}
                />
                <DashboardCard 
                  title="Upcoming Events" 
                  value={schedules.length} 
                  icon={<Calendar className="text-blue-500" />}
                  items={schedules.slice(0, 3).map(s => s.title)}
                />
                <DashboardCard 
                  title="Recent Notes" 
                  value={notes.length} 
                  icon={<StickyNote className="text-yellow-500" />}
                  items={notes.slice(0, 3).map(n => n.content.substring(0, 30) + '...')}
                />
              </motion.div>
            )}

            {activeTab === 'tasks' && (
              <motion.div 
                key="tasks"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center mb-8">
                  <h1 className="text-4xl font-bold tracking-tighter">Tasks</h1>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setEditingItem(null); setIsTaskModalOpen(true); }}
                      className="px-4 py-2 bg-[#F27D26] rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> New Task
                    </button>
                  </div>
                </div>
                <div className="grid gap-3">
                  {tasks.length === 0 && <p className="text-center text-gray-500 py-12">No tasks yet. Ask Nexus or add one manually.</p>}
                  {tasks.map(task => (
                    <div key={task.id} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between group hover:border-[#F27D26]/50 transition-all">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => handleToggleTaskStatus(task)}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                            task.status === 'completed' ? "bg-green-500 border-green-500" : "border-white/20 hover:border-[#F27D26]"
                          )}
                        >
                          {task.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-white" />}
                        </button>
                        <div>
                          <p className={cn("font-medium", task.status === 'completed' && "line-through text-gray-500")}>{task.title}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500">{task.description}</p>
                            {task.dueDate && (
                              <div className="flex items-center gap-1 text-[10px] text-[#F27D26] bg-[#F27D26]/10 px-1.5 py-0.5 rounded">
                                <Clock className="w-3 h-3" />
                                {new Date(task.dueDate).toLocaleDateString()}
                              </div>
                            )}
                            <span className={cn(
                              "text-[10px] uppercase px-1.5 py-0.5 rounded",
                              task.priority === 'high' ? 'bg-red-500/20 text-red-500' : task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'
                            )}>
                              {task.priority}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditingItem(task); setIsTaskModalOpen(true); }}
                          className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteTask(task.id!)}
                          className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'schedule' && (
              <motion.div 
                key="schedule"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center mb-8">
                  <h1 className="text-4xl font-bold tracking-tighter">Schedule</h1>
                  <button 
                    onClick={() => { setEditingItem(null); setIsScheduleModalOpen(true); }}
                    className="px-4 py-2 bg-[#F27D26] rounded-lg text-sm font-bold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> New Event
                  </button>
                </div>
                <div className="grid gap-4">
                  {schedules.length === 0 && <p className="text-center text-gray-500 py-12">No events scheduled.</p>}
                  {schedules.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map(event => (
                    <div key={event.id} className="p-6 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:border-[#F27D26]/50 transition-all">
                      <div className="flex gap-6">
                        <div className="flex flex-col items-center justify-center min-w-[60px] border-r border-white/10 pr-6">
                          <span className="text-2xl font-bold">{new Date(event.startTime).getDate()}</span>
                          <span className="text-[10px] uppercase text-gray-500">{new Date(event.startTime).toLocaleString('default', { month: 'short' })}</span>
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-bold text-lg">{event.title}</h4>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            {event.location && (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {event.location}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditingItem(event); setIsScheduleModalOpen(true); }}
                          className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteSchedule(event.id!)}
                          className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'notes' && (
              <motion.div 
                key="notes"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="flex justify-between items-center mb-8">
                  <h1 className="text-4xl font-bold tracking-tighter">Notes</h1>
                  <button 
                    onClick={() => { setEditingItem(null); setIsNoteModalOpen(true); }}
                    className="px-4 py-2 bg-[#F27D26] rounded-lg text-sm font-bold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> New Note
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {notes.length === 0 && <p className="col-span-full text-center text-gray-500 py-12">No notes yet.</p>}
                  {notes.map(note => (
                    <div key={note.id} className="p-6 bg-white/5 border border-white/10 rounded-2xl group hover:border-[#F27D26]/50 transition-all relative">
                      <p className="text-sm leading-relaxed text-gray-300 mb-4 whitespace-pre-wrap">{note.content}</p>
                      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                        <span className="text-[10px] text-gray-600">{new Date(note.createdAt).toLocaleDateString()}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => { setEditingItem(note); setIsNoteModalOpen(true); }}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteNote(note.id!)}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-2xl space-y-8"
              >
                <h1 className="text-4xl font-bold tracking-tighter">Settings</h1>
                
                <section className="p-8 bg-white/5 border border-white/10 rounded-3xl space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-2xl">
                      <AlertCircle className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Firebase Configuration</h3>
                      <p className="text-sm text-gray-500">Configure your database and authentication.</p>
                    </div>
                  </div>

                  <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-4">
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Nexus uses Firebase for real-time data sync and secure authentication. 
                      If you declined the automated setup, you can manually configure your project here.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-gray-600">Project ID</label>
                        <input 
                          type="text" 
                          readOnly 
                          value={import.meta.env.VITE_FIREBASE_PROJECT_ID || 'Not Configured'} 
                          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-gray-600">Auth Domain</label>
                        <input 
                          type="text" 
                          readOnly 
                          value={import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'Not Configured'} 
                          className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 italic">
                      To update these values, set the corresponding VITE_FIREBASE_* environment variables in your deployment settings.
                    </p>
                  </div>
                </section>

                <section className="p-8 bg-white/5 border border-white/10 rounded-3xl space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-[#F27D26]/10 rounded-2xl">
                      <Key className="w-6 h-6 text-[#F27D26]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Gemini API Configuration</h3>
                      <p className="text-sm text-gray-500">Manage the API key used for AI coordination.</p>
                    </div>
                  </div>

                  <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-4">
                    <p className="text-sm text-gray-400 leading-relaxed">
                      Nexus uses the Gemini API to coordinate your tasks and schedule. 
                      You can provide your own API key from a paid Google Cloud project to ensure higher limits and better performance.
                    </p>
                    
                    <div className="flex flex-col gap-4">
                      <button 
                        onClick={async () => {
                          try {
                            await (window as any).aistudio.openSelectKey();
                            toast.success('API Key selection opened');
                          } catch (e) {
                            toast.error('Failed to open key selection');
                          }
                        }}
                        className="w-full py-4 bg-[#F27D26] hover:bg-[#d66a1d] text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-3"
                      >
                        <Key className="w-5 h-5" />
                        Select Gemini API Key
                      </button>
                      <a 
                        href="https://ai.google.dev/gemini-api/docs/billing" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-[#F27D26] hover:underline text-center"
                      >
                        Learn about Gemini API billing and keys
                      </a>
                    </div>
                  </div>
                </section>

                <section className="p-8 bg-white/5 border border-white/10 rounded-3xl space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/5 rounded-2xl">
                      <UserIcon className="w-6 h-6 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">Account</h3>
                      <p className="text-sm text-gray-500">Manage your profile and session.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-black/40 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3">
                      <img src={user.photoURL || ''} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                      <div>
                        <p className="font-medium">{user.displayName}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleLogout}
                      className="px-4 py-2 border border-red-500/50 text-red-500 hover:bg-red-500/10 rounded-xl text-sm font-bold transition-all"
                    >
                      Sign Out
                    </button>
                  </div>
                </section>
              </motion.div>
            )}

            {activeTab === 'chat' && (
              <motion.div 
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col max-w-4xl mx-auto"
              >
                <div className="flex justify-between items-center mb-6">
                  <h1 className="text-4xl font-bold tracking-tighter">AI Chat</h1>
                  <button 
                    onClick={() => {
                      if (window.confirm('Clear all chat history?')) {
                        setMessages([]);
                        localStorage.removeItem('nexus_chat_history');
                      }
                    }}
                    className="text-xs text-gray-500 hover:text-red-500 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear History
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-6 pb-24 scrollbar-hide">
                  {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center">
                        <MessageSquare className="w-8 h-8" />
                      </div>
                      <p className="text-lg">How can I help you coordinate today?</p>
                      <div className="flex flex-wrap justify-center gap-2 max-w-md">
                        {["Add a task to buy milk", "What's on my schedule?", "Take a note about the meeting"].map(suggestion => (
                          <button 
                            key={suggestion}
                            onClick={() => setInput(suggestion)}
                            className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={cn(
                      "flex flex-col",
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    )}>
                      <div className={cn(
                        "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                        msg.role === 'user' 
                          ? 'bg-[#F27D26] text-white rounded-tr-none' 
                          : msg.role === 'system'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-none'
                      )}>
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-gray-600 mt-1 px-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex items-center gap-2 text-gray-500 text-xs animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Nexus is thinking...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="absolute bottom-8 left-8 right-8 md:left-auto md:right-auto md:w-[calc(100%-32rem)] max-w-4xl">
                  <form 
                    onSubmit={handleSendMessage}
                    className="relative group"
                  >
                    <input 
                      type="text" 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask Nexus to manage your tasks, schedule, or notes..."
                      className="w-full bg-[#1a1a1a] border border-white/10 rounded-full py-4 pl-6 pr-16 focus:outline-none focus:border-[#F27D26] transition-all shadow-2xl"
                    />
                    <button 
                      type="submit"
                      disabled={!input.trim() || isTyping}
                      className="absolute right-2 top-2 bottom-2 w-12 bg-[#F27D26] hover:bg-[#d66a1d] disabled:opacity-50 disabled:hover:bg-[#F27D26] rounded-full flex items-center justify-center transition-all"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <Modal 
        isOpen={isTaskModalOpen} 
        onClose={() => setIsTaskModalOpen(false)} 
        title={editingItem ? "Edit Task" : "New Task"}
      >
        <form onSubmit={handleSaveTask} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Title</label>
            <input name="title" defaultValue={editingItem?.title} required className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Description</label>
            <textarea name="description" defaultValue={editingItem?.description} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none h-24" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Status</label>
              <select name="status" defaultValue={editingItem?.status || 'todo'} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none">
                <option value="todo">Todo</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Priority</label>
              <select name="priority" defaultValue={editingItem?.priority || 'medium'} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Due Date</label>
            <input type="datetime-local" name="dueDate" defaultValue={editingItem?.dueDate ? editingItem.dueDate.slice(0, 16) : ''} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none" />
          </div>
          <button type="submit" className="w-full bg-[#F27D26] py-3 rounded-lg font-bold hover:bg-[#d66a1d] transition-all">
            {editingItem ? "Update Task" : "Create Task"}
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={isNoteModalOpen} 
        onClose={() => setIsNoteModalOpen(false)} 
        title={editingItem ? "Edit Note" : "New Note"}
      >
        <form onSubmit={handleSaveNote} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Content</label>
            <textarea name="content" defaultValue={editingItem?.content} required className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none h-48" />
          </div>
          <button type="submit" className="w-full bg-[#F27D26] py-3 rounded-lg font-bold hover:bg-[#d66a1d] transition-all">
            {editingItem ? "Update Note" : "Create Note"}
          </button>
        </form>
      </Modal>

      <Modal 
        isOpen={isScheduleModalOpen} 
        onClose={() => setIsScheduleModalOpen(false)} 
        title={editingItem ? "Edit Event" : "New Event"}
      >
        <form onSubmit={handleSaveSchedule} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Title</label>
            <input name="title" defaultValue={editingItem?.title} required className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Start Time</label>
              <input type="datetime-local" name="startTime" defaultValue={editingItem?.startTime ? editingItem.startTime.slice(0, 16) : ''} required className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-gray-500 mb-1">End Time</label>
              <input type="datetime-local" name="endTime" defaultValue={editingItem?.endTime ? editingItem.endTime.slice(0, 16) : ''} required className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Location</label>
            <input name="location" defaultValue={editingItem?.location} className="w-full bg-white/5 border border-white/10 rounded-lg p-3 focus:border-[#F27D26] outline-none" />
          </div>
          <button type="submit" className="w-full bg-[#F27D26] py-3 rounded-lg font-bold hover:bg-[#d66a1d] transition-all">
            {editingItem ? "Update Event" : "Create Event"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xl font-bold tracking-tight">{title}</h3>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
        active 
          ? "bg-[#F27D26] text-white" 
          : "text-gray-500 hover:text-white hover:bg-white/5"
      )}
    >
      <div className={cn("w-5 h-5 transition-transform group-hover:scale-110")}>{icon}</div>
      <span className="text-sm font-medium hidden md:block">{label}</span>
    </button>
  );
}

function DashboardCard({ title, value, icon, items }: { title: string, value: number, icon: React.ReactNode, items: string[] }) {
  return (
    <div className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:border-white/20 transition-all space-y-4">
      <div className="flex justify-between items-start">
        <div className="p-3 bg-white/5 rounded-xl">{icon}</div>
        <span className="text-3xl font-bold tracking-tighter">{value}</span>
      </div>
      <div>
        <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">{title}</h4>
        <div className="space-y-2">
          {items.length > 0 ? items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
              <ChevronRight className="w-3 h-3 text-[#F27D26]" />
              <span className="truncate">{item}</span>
            </div>
          )) : (
            <p className="text-xs text-gray-600 italic">No items found</p>
          )}
        </div>
      </div>
    </div>
  );
}
