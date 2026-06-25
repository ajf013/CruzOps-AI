import React, { useState, useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Send, Check, Copy, Bot, User, Menu, Plus, MessageSquare, X, Edit, Paperclip, Bell, Trash2, Lock, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { AzureOpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { saveChatToAzure, loadChatsFromAzure, deleteChatFromAzure } from './services/azureStorage';
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from '@clerk/clerk-react';
import { dark } from '@clerk/themes';

const SYSTEM_PROMPT = `You are an expert Azure Infrastructure Engineer AI 🚀. 
Your primary job is to write, debug, and explain Azure automation scripts.

Crucially, for EVERY prompt requesting a script, you MUST follow this structure:
1. **Script Flow 🌊**: Provide a concise, bulleted "Logical Flow" explanation of what the script does step-by-step (e.g., Auth -> Variable Setup -> Resource Deployment -> Status Check). This makes it easier for users to understand the logic before running it.
2. **Azure PowerShell Script** (using the Az module)
3. **Azure CLI Command** (using the az command)

**Important Formatting & Scripting Rules:**
- 🎨 Use emojis generously in your explanations to make them engaging!
- 🔐 **PowerShell Rule:** You MUST include \`Connect-AzAccount\` at the very beginning of every PowerShell script provided.
- ⏳ For PowerShell scripts that involve loops, multiple resources, or long-running tasks, you MUST include \`Write-Progress\` to show a live progress bar to the user while the script is running.
- ⏳ For Azure CLI scripts with loops, include simple terminal progress indicators or \`echo\` status updates.
- Always format scripts in clearly labeled markdown code blocks (e.g., \`\`\`powershell and \`\`\`bash).

If the user says a script is wrong or provides an error, analyze the context of your previous script and provide corrected versions of both.
Be concise but explain the key differences or commands used in both tools.
🔐 **Security Note:** Remind users to provide valid requirements but never to share sensitive credentials or secrets. Build trust by emphasizing reliability and best practices.`;

const TITLE_PROMPT = `You are a helpful assistant. Summarize the user's prompt into a concise 3-4 word title. Respond ONLY with the title. Do not include quotes or punctuation.`;

export default function App() {
  const { userId, isLoaded } = useAuth();
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Credentials State
  const [endpoint, setEndpoint] = useState(import.meta.env.VITE_AZURE_OPENAI_ENDPOINT || '');
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_AZURE_OPENAI_API_KEY || '');
  const [deployment, setDeployment] = useState(import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT_NAME || '');
  const [abortController, setAbortController] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const APP_VERSION = '2.3.0';
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // PWA Update Hook
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const currentChat = chats.find(c => c.id === currentChatId) || { messages: [] };

  useEffect(() => {
    scrollToBottom();
  }, [currentChat.messages]);

  // Auto-adjust height of the textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [input]);

  // Initial Load
  useEffect(() => {
    if (!isLoaded || !userId) return;

    const loadData = async () => {
      // 1. Instant local recovery
      const localHistory = JSON.parse(localStorage.getItem(`local_chats_${userId}`) || '{}');
      const localArray = Object.values(localHistory).sort((a, b) => new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0));
      
      if (localArray.length > 0) {
        setChats(localArray);
        setCurrentChatId(localArray[0].id);
      }

      // 2. Background sync from Azure
      const history = await loadChatsFromAzure(userId);
      if (history.length > 0) {
        setChats(history);
        // Only set current ID if we didn't have a local one or if the local one is 'New Chat'
        if (localArray.length === 0 || localArray[0].title === 'New Chat') {
          setCurrentChatId(history[0].id);
        }
      } else if (localArray.length === 0) {
        startNewChat();
      }
    };
    loadData();

    if (!endpoint || !apiKey || !deployment) {
      console.warn("Azure OpenAI credentials are not fully configured in the server environment.");
    }

    // Version Check
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion && storedVersion !== APP_VERSION) {
      setShowVersionModal(true);
    }
    localStorage.setItem('app_version', APP_VERSION);
  }, [isLoaded, userId]);

  // Periodic Update Check (Every 10 minutes)
  useEffect(() => {
    const checkUpdates = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            await registration.update();
            console.log("Checking for PWA updates...");
          }
        } catch (err) {
          console.error("Failed to check for PWA updates:", err);
        }
      }
    };

    const interval = setInterval(checkUpdates, 600000); // 10 minutes
    checkUpdates(); // Check once on mount
    
    return () => clearInterval(interval);
  }, []);

  // Splash Screen Timer
  useEffect(() => {
    if (isLoaded) {
      const timer = setTimeout(() => {
        setShowSplash(false);
      }, 2500); // 2.5 seconds premium intro
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);

  const startNewChat = () => {
    const newId = uuidv4();
    const newChat = {
      id: newId,
      title: 'New Chat',
      messages: [{ role: 'assistant', content: 'Hello! I am your Azure Automation Assistant. What task can I help you script using PowerShell and Azure CLI today?' }]
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newId);
    setSidebarOpen(false);
  };

  const updateChatMessages = (id, newMessages, title = null, saveToCloud = true) => {
    setChats(prev => prev.map(c => {
      if (c.id === id) {
        const updatedChat = { ...c, messages: newMessages };
        if (title) updatedChat.title = title;
        if (saveToCloud && userId) {
          saveChatToAzure(id, updatedChat.title, newMessages, userId);
        }
        return updatedChat;
      }
      return c;
    }));
  };

  const generateTitle = async (userMsg) => {
    try {
      const client = new AzureOpenAI({
        endpoint: endpoint.trim(), apiKey: apiKey.trim(), apiVersion: '2024-02-15-preview', deployment: deployment.trim(), dangerouslyAllowBrowser: true
      });
      const response = await client.chat.completions.create({
        messages: [
          { role: 'system', content: TITLE_PROMPT },
          { role: 'user', content: userMsg }
        ],
        model: deployment,
        temperature: 0.3,
      });
      return response.choices[0].message.content.trim();
    } catch (e) {
      return "Azure Task";
    }
  };
  
  const handleStop = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsLoading(false);
    }
  };

  const handleEdit = (msgContent, index) => {
    // Set input to message content
    setInput(msgContent);
    // Remove this message and all subsequent messages from the chat
    const updatedMessages = currentChat.messages.slice(0, index);
    updateChatMessages(currentChatId, updatedMessages, null, true);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachment({
          name: file.name,
          type: file.type,
          data: reader.result
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this chat? This will remove it from Azure Storage to save costs.")) {
      await deleteChatFromAzure(chatId, userId);
      const updatedChats = chats.filter(c => c.id !== chatId);
      setChats(updatedChats);
      if (currentChatId === chatId) {
        if (updatedChats.length > 0) {
          setCurrentChatId(updatedChats[0].id);
        } else {
          startNewChat();
        }
      }
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!endpoint || !apiKey || !deployment) {
      updateChatMessages(currentChatId, [...currentChat.messages, userMsg, { role: 'assistant', content: '❌ **System Error**: Azure OpenAI credentials are not configured in the server environment.'}]);
      setIsLoading(false);
      setInput('');
      return;
    }

    const userMsg = { 
      role: 'user', 
      content: input,
      attachment: attachment // Keep internal record of attachment
    };
    const newMessages = [...currentChat.messages, userMsg];
    
    setInput('');
    setAttachment(null);
    setIsLoading(true);
    
    const controller = new AbortController();
    setAbortController(controller);

    // Optimistically update UI without saving to cloud yet
    updateChatMessages(currentChatId, newMessages, null, false);

    try {
      const client = new AzureOpenAI({
        endpoint: endpoint.trim(),
        apiKey: apiKey.trim(),
        apiVersion: '2024-02-15-preview',
        deployment: deployment.trim(),
        dangerouslyAllowBrowser: true,
        abortSignal: controller.signal
      });

      const apiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...newMessages.map(m => {
          if (m.attachment && m.attachment.type.startsWith('image/')) {
            return {
              role: m.role,
              content: [
                { type: 'text', text: m.content },
                { type: 'image_url', image_url: { url: m.attachment.data } }
              ]
            };
          }
          return { role: m.role, content: m.content };
        })
      ];

      const stream = await client.chat.completions.create({
        messages: apiMessages,
        model: deployment,
        temperature: 0.2,
        stream: true
      });

      let assistantContent = '';
      let isFirstChunk = true;
      
      for await (const chunk of stream) {
        const chunkText = chunk.choices[0]?.delta?.content;
        if (chunkText) {
          if (isFirstChunk) {
            isFirstChunk = false;
          }

          // Typewriter effect: iterate through characters of the chunk
          for (let i = 0; i < chunkText.length; i++) {
            assistantContent += chunkText[i];
            updateChatMessages(currentChatId, [...newMessages, { role: 'assistant', content: assistantContent }], null, false);
            
            // Haptic feedback per character (mechanical feel)
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try { navigator.vibrate(2); } catch (e) {}
            }

            // Small delay for typing feel
            await new Promise(resolve => setTimeout(resolve, 15));
          }
        }
      }

      const finalMessages = [...newMessages, { role: 'assistant', content: assistantContent }];
      
      let newTitle = currentChat.title;
      if (finalMessages.length === 3 && currentChat.title === 'New Chat') {
        newTitle = await generateTitle(userMsg.content);
      }

      // Final cloud save after streaming is done
      updateChatMessages(currentChatId, finalMessages, newTitle, true);
    } catch (error) {
      console.error("OpenAI Error:", error);
      updateChatMessages(currentChatId, [...newMessages, { 
        role: 'assistant', 
        content: `**Error communicating with Azure OpenAI:**\n\`\`\`\n${error.message}\n\`\`\`\nPlease check your credentials and endpoint in settings.` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const CodeBlock = ({ node, inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
      navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    const language = match ? match[1] : 'text';

    if (!inline && match) {
      return (
        <div className="code-wrapper">
          <div className="code-header">
            <span>{language}</span>
            <div style={{position: 'relative'}}>
              {copied && <span className="copy-feedback">Text copied to clipboard</span>}
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? <Check size={16} color="#4ade80" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={language}
            PreTag="div"
            customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        </div>
      );
    }
    return <code className={className} {...props}>{children}</code>;
  };

  return (
    <div className="app-container">
      <div className={`splash-screen ${(!showSplash && isLoaded) ? 'fade-out' : ''}`}>
        <img src="/logo.svg" alt="CruzOps AI" className="splash-logo" />
        <div className="splash-content">
          <h1>CruzOps AI</h1>
          <p>Enterprise-grade Azure Infrastructure Assistant</p>
        </div>
      </div>

      <SignedOut>
        <div style={{
          height: '100vh', 
          width: '100vw', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'radial-gradient(circle at center, var(--bg-panel), var(--bg-dark))',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Subtle background glow */}
          <div style={{
            position: 'absolute',
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle, hsla(217, 91%, 60%, 0.15) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none'
          }} />
          <SignIn 
            routing="hash" 
            appearance={{
              baseTheme: dark,
              variables: {
                colorPrimary: '#3b82f6',
                colorBackground: 'rgba(15, 23, 42, 0.65)',
                colorText: '#f8fafc',
                colorInputBackground: '#1e293b',
                colorInputText: '#f8fafc',
                colorTextSecondary: '#94a3b8',
              },
              elements: {
                card: {
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(16px)',
                  background: 'rgba(15, 23, 42, 0.65)',
                },
                socialButtonsIconButton: {
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  }
                },
                socialButtonsBlockButton: {
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  }
                }
              }
            }}
          />
        </div>
      </SignedOut>
      
      <SignedIn>
        {(needRefresh || showUpdateBanner) && (
          <div className="update-banner">
            <Bell size={16} />
            <span>A new version of CruzOps AI is available!</span>
            <button onClick={() => updateServiceWorker(true)}>Update Now</button>
            <button className="close-banner" onClick={() => { setNeedRefresh(false); setShowUpdateBanner(false); }}><X size={14}/></button>
          </div>
        )}

        {showVersionModal && (
          <div className="modal-overlay">
            <div className="modal version-modal">
              <h2>🎉 What's New in v{APP_VERSION}</h2>
              <ul className="feature-list">
                <li>🔐 **Auto-Auth**: `Connect-AzAccount` now included in every script.</li>
                <li>🛑 **Stop Bot**: Cancel AI generation mid-stream.</li>
                <li>✍️ **Message Editing**: Edit and re-send your prompts easily.</li>
                <li>📎 **File Attachments**: Attach screenshots for AI review.</li>
                <li>⌨️ **Shift+Enter**: Multi-line support in the chat box.</li>
                <li>🌊 **Script Flows**: Every script now includes a step-by-step logic explanation.</li>
                <li>🔄 **Auto-Updates**: The app now checks for updates in the background.</li>
              </ul>
              <button onClick={() => setShowVersionModal(false)}>Got it!</button>
            </div>
          </div>
        )}

        <div className={`app-layout fade-in ${(needRefresh || showUpdateBanner) ? 'with-banner' : ''}`}>
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
            <Bot size={24} color="#3b82f6" />
            <h2>History</h2>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <button className="new-chat-btn" onClick={startNewChat}>
          <Plus size={18} /> New Chat
        </button>
        <div className="chat-list">
          {!isLoaded || (chats.length === 0 && !currentChatId) ? (
            <>
              <div className="skeleton-row" />
              <div className="skeleton-row" />
              <div className="skeleton-row" />
            </>
          ) : (
            chats.map(chat => (
              <div 
                key={chat.id} 
                className={`chat-item ${currentChatId === chat.id ? 'active' : ''}`}
                onClick={() => {
                  setCurrentChatId(chat.id);
                  setSidebarOpen(false);
                }}
              >
                <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0}}>
                  <MessageSquare size={16} />
                  <span>{chat.title}</span>
                </div>
                <button className="delete-chat-btn" onClick={(e) => handleDeleteChat(e, chat.id)} title="Delete chat">
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="app-container">
        <header className="header">
          <div className="header-left">
            <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <img src="/logo.svg" alt="CruzOps Logo" style={{width: 32, height: 32, marginRight: '8px'}} />
            <h1>CruzOps AI</h1>
          </div>
          <div className="header-right" style={{display: 'flex', alignItems: 'center'}}>
            <UserButton 
              afterSignOutUrl="/" 
              appearance={{
                baseTheme: dark,
                variables: {
                  colorPrimary: '#3b82f6',
                }
              }}
            />
          </div>
        </header>

        <div className="chat-container">
          {currentChat.messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className={`message ${msg.role} ${isLoading && index === currentChat.messages.length - 1 && msg.role === 'assistant' ? 'typing' : ''}`}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{ code: CodeBlock }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem'}}>
                    <span style={{flex: 1}}>{msg.content}</span>
                    <button 
                      className="edit-btn" 
                      onClick={() => handleEdit(msg.content, index)}
                      title="Edit message"
                    >
                      <Edit size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && currentChat.messages[currentChat.messages.length - 1]?.role !== 'assistant' && (
            <div className="message-wrapper assistant">
              <div className="message assistant loading-indicator" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <Bot size={16} /> Generating response
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
                <button className="stop-btn" onClick={handleStop} title="Stop generation">
                  <X size={14} /> Stop
                </button>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <div className="privacy-disclaimer">
            <ShieldCheck size={14} color="rgba(255,255,255,0.4)" />
            <span>Privacy Note: Please do not share sensitive credentials. Trust the bot with valid information.</span>
          </div>
          {attachment && (
            <div className="attachment-preview">
              <div className="preview-content">
                {attachment.type.startsWith('image/') ? (
                  <img src={attachment.data} alt="preview" />
                ) : (
                  <Bot size={24} />
                )}
                <span>{attachment.name}</span>
                <button onClick={() => setAttachment(null)}><X size={14}/></button>
              </div>
            </div>
          )}
          <form className="input-container" onSubmit={handleSend}>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{display: 'none'}} 
              onChange={handleFileChange}
              accept="image/*, .txt, .js, .ps1, .py"
            />
            <button 
              type="button" 
              className="attach-btn" 
              onClick={() => fileInputRef.current.click()}
              disabled={isLoading}
            >
              <Paperclip size={20} />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder="Ask for an Azure script or attach a screenshot for review..."
              disabled={isLoading}
              rows="1"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                padding: '0.75rem 1rem',
                color: 'white',
                fontSize: '1rem',
                outline: 'none',
                resize: 'none',
                minHeight: '24px',
                maxHeight: '200px',
                overflowY: 'auto'
              }}
            />
            <button type="submit" className="send-btn" disabled={(!input.trim() && !attachment) || isLoading}>
              <Send size={20} />
            </button>
          </form>
        </div>
        </div>
      </div>
      </SignedIn>
    </div>
  );
}
