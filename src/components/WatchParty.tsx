import { useState, useRef, useCallback } from 'react';
import { Users, Copy, Check, Link as LinkIcon, Play, X, MessageCircle, Send } from 'lucide-react';
import type { MediaItem } from '@/types';

interface WatchPartyProps {
  item: MediaItem;
  onClose: () => void;
}

interface PartyMessage {
  id: string;
  user: string;
  text: string;
  timestamp: number;
}

export default function WatchParty({ item, onClose }: WatchPartyProps) {
  const [roomCode] = useState(() => Math.random().toString(36).substring(2, 8).toUpperCase());
  const [copied, setCopied] = useState(false);
  const [username, setUsername] = useState(() => {
    const stored = localStorage.getItem('ks_party_name');
    return stored || `میوان_${Math.floor(Math.random() * 1000)}`;
  });
  const [messages, setMessages] = useState<PartyMessage[]>([
    { id: '0', user: 'سیستەم', text: 'ژووری سەیری بەیەکەوە دروستکرا! لینک بەشداربکە بۆ هاوڕێکانت.', timestamp: Date.now() },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const partyUrl = `${window.location.origin}/party/${roomCode}`;

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(partyUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [partyUrl]);

  const saveUsername = (name: string) => {
    setUsername(name);
    localStorage.setItem('ks_party_name', name);
  };

  const sendMessage = () => {
    if (!inputMessage.trim()) return;
    const msg: PartyMessage = {
      id: Math.random().toString(36).substring(2),
      user: username,
      text: inputMessage.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, msg]);
    setInputMessage('');
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const title = item.title || item.name || '';

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#0d0e12] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">سەیری بەیەکەوە بکە</h2>
              <p className="text-white/40 text-xs">ژووری هاوبەش — {roomCode}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Selected media */}
          <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/10">
            <img
              src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
              alt={title}
              className="w-12 h-18 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm truncate" dir="auto">{title}</p>
              <p className="text-white/40 text-xs">ئەم بەرهەمە سەیری دەکەن بەیەکەوە</p>
            </div>
          </div>

          {/* Share link */}
          <div>
            <p className="text-white/50 text-xs font-bold mb-2 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5" />
              لینکی ژوورەکە
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={partyUrl}
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white/70 text-xs font-mono outline-none"
                dir="ltr"
              />
              <button
                onClick={copyLink}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'کۆپی کرایەوە' : 'کۆپی'}
              </button>
            </div>
          </div>

          {/* Username */}
          <div>
            <p className="text-white/50 text-xs font-bold mb-2">ناوی تۆ لە ژوورەکە</p>
            <input
              value={username}
              onChange={e => saveUsername(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-amber-500/50 transition-colors"
              dir="rtl"
              maxLength={20}
            />
          </div>

          {/* Chat */}
          <div>
            <p className="text-white/50 text-xs font-bold mb-2 flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" />
              گفتوگۆ
            </p>
            <div className="bg-black/30 border border-white/10 rounded-xl p-3 h-48 overflow-y-auto flex flex-col gap-2">
              {messages.map(msg => (
                <div key={msg.id} className={`flex flex-col ${msg.user === username ? 'items-end' : 'items-start'}`}>
                  <span className="text-white/30 text-[10px] mb-0.5">{msg.user}</span>
                  <span
                    className={`px-3 py-1.5 rounded-lg text-xs max-w-[80%] ${
                      msg.user === username
                        ? 'bg-amber-600/20 text-amber-100 border border-amber-500/20'
                        : msg.user === 'سیستەم'
                        ? 'bg-white/5 text-white/50 border border-white/5'
                        : 'bg-white/10 text-white/80 border border-white/10'
                    }`}
                    dir="auto"
                  >
                    {msg.text}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
                placeholder="نووسینی پەیام..."
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-amber-500/50 transition-colors"
                dir="rtl"
                maxLength={200}
              />
              <button
                onClick={sendMessage}
                className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Start watching */}
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-sm bg-amber-600 hover:bg-amber-500 text-white transition-all"
          >
            <Play className="w-4 h-4 fill-white" />
            دەستپێکردنی سەیرکردن
          </button>
        </div>
      </div>
    </div>
  );
}
