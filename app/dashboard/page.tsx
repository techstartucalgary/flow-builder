'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts';

import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  ChevronRight, 
  LayoutDashboard, 
  Folder, 
  BarChart3, 
  Settings, 
  Plus, 
  X,
  Loader2,
  LogOut 
} from 'lucide-react';

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  
  const [dragActive, setDragActive] = useState(false);
  const [uploads, setUploads] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);


  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/signin');
    }
  }, [user, loading, router]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (files: FileList) => {
    setIsUploading(true);
    
  
    setTimeout(() => {
      const newFiles = Array.from(files).map(file => ({
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        type: file.type.includes('pdf') ? 'PDF' : 'IMAGE',
        date: new Date().toLocaleDateString(),
        status: 'Ready'
      }));
      setUploads(prev => [...newFiles, ...prev]);
      setIsUploading(false);
    }, 1500);
  };

  const removeFile = (index: number) => {
    setUploads(prev => prev.filter((_, i) => i !== index));
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <Loader2 className="animate-spin text-blue-500 w-10 h-10" />
      </div>
    );
  }

  
  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#030712] text-white font-sans selection:bg-blue-500/30">
      
      <nav className="fixed top-0 left-0 w-full z-50 bg-[#030712]/90 backdrop-blur-xl border-b border-white/10 h-16 flex items-center justify-end px-8">
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 border border-white/10 flex items-center justify-center text-xs font-bold">
                    {user.email?.substring(0,2).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-gray-300 hidden sm:block">{user.email}</span>
            </div>
            <button 
                onClick={() => signOut()} 
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
                <LogOut size={16} />
                <span>Sign Out</span>
            </button>
         </div>
      </nav>
      
      {/* Main Layout Container */}
      <div className="flex pt-16 h-screen overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-64 bg-[#030712] border-r border-white/5 hidden lg:flex flex-col">
            <div className="p-6 flex-1">
              <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-6 pl-2">Overview</h3>
              <nav className="space-y-2">
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-white bg-blue-600/10 border-r-2 border-blue-500 rounded-l-lg transition-all">
                    <LayoutDashboard size={18} className="text-blue-400" /> 
                    <span className="font-medium">Dashboard</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                    <Folder size={18} /> My Projects
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                    <BarChart3 size={18} /> Cost Reports
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                    <Settings size={18} /> Settings
                  </button>
              </nav>
            </div>
            
            {/* User Profile Snippet */}
            <div className="p-6 border-t border-white/5">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 border border-white/10 flex items-center justify-center text-xs font-bold">
                        {user.email?.substring(0,2).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-sm font-medium text-white truncate">{user.email}</p>
                        <p className="text-xs text-gray-500 truncate">Free Plan</p>
                    </div>
                </div>
            </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 lg:p-10 overflow-y-auto bg-gradient-to-b from-[#030712] to-[#0b1120]">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
                    <p className="text-gray-400 mt-1">Upload your blueprints to generate a new estimate.</p>
                </div>
                <button className="px-5 py-2.5 rounded-full font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all">
                    <Plus size={18} /> New Project
                </button>
            </header>

            {/* Drag Drop Upload Zone */}
            <div 
              className={`w-full h-80 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-300 mb-12 group relative overflow-hidden ${
                  dragActive 
                  ? "border-blue-500 bg-blue-500/10" 
                  : "border-gray-800 bg-[#0b1120] hover:border-gray-600"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {/* background blob */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/20 transition-all"></div>
              
              <div className="relative z-10 p-6 rounded-full bg-[#1e293b] border border-gray-700 mb-6 group-hover:scale-110 transition-transform shadow-xl">
                  {isUploading ? <Loader2 size={40} className="text-blue-400 animate-spin" /> : <Upload size={40} className="text-blue-400" />}
              </div>
              
              <h3 className="relative z-10 text-xl font-semibold text-white mb-2">
                {isUploading ? 'Processing Files...' : 'Upload Floor Plans'}
              </h3>
              
              <p className="relative z-10 text-gray-400 mb-8 text-sm max-w-sm text-center">
                Drag & drop your PDF, JPG, or JPEG blueprints here to start analyzing costs immediately.
              </p>
              
              <label className="relative z-10 cursor-pointer">
                  <span className="px-8 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition-colors border border-white/10 hover:border-white/20 backdrop-blur-sm">
                    Browse Computer
                  </span>
                  <input 
                    type="file" 
                    className="hidden" 
                    multiple 
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleChange} 
                  />
              </label>
            </div>

    
            <div>
               
                
                {uploads.length === 0 ? (
                  <div className="text-center py-20 border border-dashed border-gray-800 rounded-xl bg-white/5">
                      <Folder size={48} className="mx-auto text-gray-700 mb-4" />
                      <p className="text-gray-500 font-medium">No projects yet.</p>
                      <p className="text-gray-600 text-sm mt-1">Upload a plan above to get started.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {uploads.map((file, idx) => (
                      <div key={idx} className="group p-5 rounded-xl bg-[#0b1120] border border-white/5 flex items-center gap-4 hover:border-blue-500/40 hover:bg-[#111827] transition-all cursor-pointer relative">
                          {/* File Icon */}
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${file.type === 'PDF' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            {file.type === 'PDF' ? <FileText size={24} /> : <ImageIcon size={24} />}
                          </div>
                          
                          {/* File Info */}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-medium truncate group-hover:text-blue-400 transition-colors">{file.name}</h4>
                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                <span>{file.size}</span>
                                <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                                <span>{file.date}</span>
                            </p>
                          </div>
                          
                          {/* Delete Button*/}
                          <button 
                            onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                            className="absolute top-2 right-2 p-1.5 text-gray-600 hover:text-red-400 hover:bg-white/5 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X size={14} />
                          </button>

                          {/* Arrow */}
                          <div className="p-2 text-gray-600 group-hover:text-white transition-colors">
                            <ChevronRight size={20} />
                          </div>
                      </div>
                      ))}
                  </div>
                )}
            </div>
        </main>
      </div>
    </div>
  );
}