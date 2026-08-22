import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Headphones,
  Bot,
  User,
  Sparkles,
  Package,
  Gift,
  Fuel,
  HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supportApi } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  authorId: string;
  authorType: 'customer' | 'agent' | 'admin';
  authorName?: string;
  message: string;
  createdAt: string;
}

export const LiveChatWidget: React.FC = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatSession = async () => {
    try {
      setLoading(true);
      const res = await supportApi.getChatSession();
      if (res.data?.success && res.data?.session) {
        setTicketId(res.data.session.ticketId);
        setMessages(res.data.session.messages || []);
      }
    } catch (err) {
      console.error('Failed to load chat session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadChatSession();
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      scrollToBottom();
    }
  }, [isOpen, messages]);

  // Subscribe to Supabase Realtime updates on support_tickets
  useEffect(() => {
    if (!ticketId) return;

    const channel = supabase
      .channel(`support-chat-${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${ticketId}` },
        (payload: any) => {
          if (payload.new?.replies) {
            setMessages(payload.new.replies);
            if (!isOpen) {
              setUnreadCount((c) => c + 1);
              toast.info('New message from Nadi Support');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId, isOpen]);

  const handleSendMessage = async (customMessage?: string) => {
    const text = (customMessage || inputText).trim();
    if (!text) return;

    try {
      setSending(true);
      if (!customMessage) setInputText('');

      const res = await supportApi.sendChatMessage({
        message: text,
        ticketId: ticketId || undefined
      });

      if (res.data?.success && res.data?.messages) {
        setMessages(res.data.messages);
      } else {
        toast.error(res.error || 'Failed to send message');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const quickChips = [
    { label: 'Track Delivery', icon: Package, text: 'I want to track my delivery shipment' },
    { label: 'Gift Card Rates', icon: Gift, text: 'What are the current gift card exchange rates?' },
    { label: 'Fuel Prices', icon: Fuel, text: 'What is the current price of fuel and cooking gas?' },
    { label: 'Talk to Agent', icon: Headphones, text: 'I need to speak with a human support agent' }
  ];

  if (!user) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Chat Drawer Window */}
      {isOpen && (
        <div className="w-[360px] sm:w-[400px] h-[540px] bg-white rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden mb-3 animate-in fade-in slide-in-from-bottom-5 duration-200">
          {/* Chat Header */}
          <div className="bg-gradient-to-r from-orange-600 to-amber-600 p-4 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Headphones className="h-5 w-5" />
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-orange-600 rounded-full" />
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight">Nadi Live Helpdesk</h3>
                <p className="text-[11px] text-orange-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  Online · Instant smart support
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Action Chips Bar */}
          <div className="bg-slate-50 border-b border-slate-100 p-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickChips.map((chip, idx) => (
              <button
                key={idx}
                disabled={sending}
                onClick={() => handleSendMessage(chip.text)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-slate-200 hover:border-orange-300 hover:text-orange-600 text-[11px] font-medium text-slate-700 whitespace-nowrap shadow-2xs active:scale-95 transition-all"
              >
                <chip.icon className="h-3 w-3 text-orange-500" />
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50 text-xs">
            {loading ? (
              <div className="py-20 text-center space-y-2">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-orange-500" />
                <p className="text-slate-400 text-xs">Connecting to support assistant...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-slate-400 space-y-2">
                <HelpCircle className="h-8 w-8 mx-auto text-slate-300" />
                <p>No messages yet. Ask a question below!</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isUser = msg.authorType === 'customer';
                return (
                  <div
                    key={msg.id || index}
                    className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white ${
                        isUser ? 'bg-orange-600' : 'bg-slate-800'
                      }`}
                    >
                      {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    </div>

                    {/* Bubble */}
                    <div
                      className={`max-w-[78%] rounded-2xl p-3 shadow-2xs ${
                        isUser
                          ? 'bg-orange-600 text-white rounded-tr-none'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                      }`}
                    >
                      {!isUser && (
                        <p className="text-[10px] font-bold text-orange-600 mb-0.5 flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" />
                          {msg.authorName || 'Nadi Assistant'}
                        </p>
                      )}
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                      <p
                        className={`text-[9px] mt-1 text-right ${
                          isUser ? 'text-orange-200' : 'text-slate-400'
                        }`}
                      >
                        {msg.createdAt
                          ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask anything or request help..."
              className="rounded-xl text-xs bg-slate-50 border-slate-200 focus:bg-white"
              disabled={sending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !inputText.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white rounded-xl shrink-0 h-9 w-9"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative group h-14 w-14 rounded-full bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-xl shadow-orange-600/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-200 border-2 border-white"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        
        {/* Unread Badge */}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};

export default LiveChatWidget;
