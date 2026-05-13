import React, { useState, useEffect, useRef } from 'react';
import { Send, Check, Copy, Bot, User, Menu, Plus, MessageSquare, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { AzureOpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { saveChatToAzure, loadChatsFromAzure } from './services/azureStorage';
import { SignedIn, SignedOut, SignIn, UserButton, useAuth } from '@clerk/clerk-react';

const SYSTEM_PROMPT = `You are an expert Azure Infrastructure Engineer AI 🚀. 
Your primary job is to write, debug, and explain Azure automation scripts.
Crucially, for EVERY prompt requesting a script, you MUST provide BOTH:
1. The Azure PowerShell script (using the Az module)
2. The Azure CLI command (using the az command)

**Important Formatting & Scripting Rules:**
- 🎨 Use emojis generously in your explanations to make them engaging!
- ⏳ For PowerShell scripts that involve loops, multiple resources, or long-running tasks, you MUST include \`Write-Progress\` to show a live progress bar to the user while the script is running.
- ⏳ For Azure CLI scripts with loops, include simple terminal progress indicators or \`echo\` status updates.
- Always format scripts in clearly labeled markdown code blocks (e.g., \`\`\`powershell and \`\`\`bash).

If the user says a script is wrong or provides an error, analyze the context of your previous script and provide corrected versions of both.
Be concise but explain the key differences or commands used in both tools.`;

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
  
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const currentChat = chats.find(c => c.id === currentChatId) || { messages: [] };

  useEffect(() => {
    scrollToBottom();
  }, [currentChat.messages]);

  // Initial Load
  useEffect(() => {
    if (!isLoaded || !userId) return;

    const loadData = async () => {
      const history = await loadChatsFromAzure(userId);
      if (history.length > 0) {
        setChats(history);
        setCurrentChatId(history[0].id);
      } else {
        startNewChat();
      }
    };
    loadData();

    if (!endpoint || !apiKey || !deployment) {
      console.warn("Azure OpenAI credentials are not fully configured in the server environment.");
    }
  }, [isLoaded, userId]);

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

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!endpoint || !apiKey || !deployment) {
      updateChatMessages(currentChatId, [...currentChat.messages, userMsg, { role: 'assistant', content: '❌ **System Error**: Azure OpenAI credentials are not configured in the server environment.'}]);
      setIsLoading(false);
      setInput('');
      return;
    }

    const userMsg = { role: 'user', content: input };
    const newMessages = [...currentChat.messages, userMsg];
    
    setInput('');
    setIsLoading(true);
    
    // Optimistically update UI without saving to cloud yet
    updateChatMessages(currentChatId, newMessages, null, false);

    try {
      const client = new AzureOpenAI({
        endpoint: endpoint.trim(),
        apiKey: apiKey.trim(),
        apiVersion: '2024-02-15-preview',
        deployment: deployment.trim(),
        dangerouslyAllowBrowser: true
      });

      const apiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...newMessages.map(m => ({ role: m.role, content: m.content }))
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
        if (chunk.choices[0]?.delta?.content) {
          if (isFirstChunk) {
            isFirstChunk = false;
          }
          assistantContent += chunk.choices[0].delta.content;
          updateChatMessages(currentChatId, [...newMessages, { role: 'assistant', content: assistantContent }], null, false);
          
          // Haptic feedback for mobile phones (simulates mechanical typing vibration)
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate(2); } catch (e) {}
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

    if (!inline && match) {
      return (
        <div className="code-wrapper">
          <div className="code-header">
            <span>{match[1]}</span>
            <button className="copy-btn" onClick={handleCopy} title="Copy code">
              {copied ? <Check size={14} color="#4ade80" /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={match[1]}
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

  if (!isLoaded) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'}}>Loading Authentication...</div>;

  return (
    <>
      <SignedOut>
        <div style={{height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-dark)'}}>
          <SignIn routing="hash" />
        </div>
      </SignedOut>
      
      <SignedIn>
        <div className="app-layout">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={startNewChat}>
            <Plus size={18} /> New Chat
          </button>
          <button className="menu-toggle" style={{marginLeft: '0.5rem'}} onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="chat-history">
          {chats.map(chat => (
            <button 
              key={chat.id} 
              className={`history-item ${chat.id === currentChatId ? 'active' : ''}`}
              onClick={() => { setCurrentChatId(chat.id); setSidebarOpen(false); }}
              title={chat.title}
            >
              <MessageSquare size={14} style={{display:'inline', marginRight:'8px', verticalAlign:'text-bottom'}}/>
              {chat.title}
            </button>
          ))}
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
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        <div className="chat-container">
          {currentChat.messages.map((msg, index) => (
            <div key={index} className={`message-wrapper ${msg.role}`}>
              <div className={`message ${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{ code: CodeBlock }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          
          {isLoading && currentChat.messages[currentChat.messages.length - 1]?.role !== 'assistant' && (
            <div className="message-wrapper assistant">
              <div className="message assistant loading-indicator">
                <Bot size={16} /> Generating response
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <form className="input-container" onSubmit={handleSend}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for an Azure script (e.g., Create a VM)..."
              disabled={isLoading}
            />
            <button type="submit" className="send-btn" disabled={!input.trim() || isLoading}>
              <Send size={20} />
            </button>
          </form>
        </div>
        </div>
      </div>
      </SignedIn>
    </>
  );
}
