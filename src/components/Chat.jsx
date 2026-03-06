import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { useNavigate } from 'react-router-dom';

const socket = io(import.meta.env.DEV ? undefined : import.meta.env.VITE_API_BASE_URL, { transports: ['polling'] });

const Chat = () => {
  const navigate = useNavigate();
  const userStr = localStorage.getItem('user');
  const user = userStr && userStr !== 'undefined' ? JSON.parse(userStr) : null;
  const chatRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isAtBottomRef = useRef(true);

  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState('');
  const [isFounder, setIsFounder] = useState(false);
  const [message, setMessage] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showModal, setShowModal] = useState(!!user);
  const [joined, setJoined] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [privateRecipient, setPrivateRecipient] = useState('');
  const [expandedMessages, setExpandedMessages] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [noMoreMessages, setNoMoreMessages] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => setMenuOpen(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        setShowModal(s => !s);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [user?.username, user, navigate]);

  useEffect(() => {
    if (!user) return;
    socket.on('userJoined', (user) => {
      setMessages(prev => [...prev, { text: `${user} joined the chat`, system: true }]);
    });

    socket.on('userLeft', (user) => {
      setMessages(prev => [...prev, { text: `${user} left the chat`, system: true }]);
    });

    socket.on('userList', (userList) => {
      setUsers(userList);
    });

    socket.on('isFounder', (founder) => {
      setIsFounder(founder);
    });

    socket.on('loadMessages', (msgs) => {
      setMessages(msgs);
      setHasMore(false);
    });

    socket.on('ChatMessage', (msg) => {
      setMessages(prev => [...prev, msg]);
      if (!isAtBottomRef.current) {
        setNewMessagesCount(prev => prev + 1);
      } else {
        setTimeout(() => {
          if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
          }
        }, 0);
      }
    });

    socket.on('privateMessage', (msg) => {
      setMessages(prev => [...prev, { ...msg, private: true }]);
      if (!isAtBottomRef.current) {
        setNewMessagesCount(prev => prev + 1);
      } else {
        setTimeout(() => {
          if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
          }
        }, 0);
      }
    });

    socket.on('messagesUpdate', (msgs) => {
      setMessages(msgs);
    });

    socket.on('messageEdited', (updatedMsg) => {
      setMessages(prev => prev.map(msg => msg.id === updatedMsg.id ? updatedMsg : msg));
    });

    socket.on('typingUsers', (users) => {
      const filtered = users.filter(u => u !== user.username);
      setTyping(filtered.length > 0 ? filtered.join(', ') + ' is typing...' : '');
    });

    socket.on('message', (msg) => {
      setMessages(prev => [...prev, { text: msg, system: true }]);
    });

    socket.on('olderMessages', (older) => {
      const oldScrollHeight = chatRef.current ? chatRef.current.scrollHeight : 0;
      setMessages(prev => [...older, ...prev]);
      setHasMore(false);
      if (older.length === 0) {
        setNoMoreMessages(true);
        setTimeout(() => setNoMoreMessages(false), 3000);
      }
      setTimeout(() => {
        if (chatRef.current) {
          const newScrollHeight = chatRef.current.scrollHeight;
          chatRef.current.scrollTop = newScrollHeight - oldScrollHeight;
        }
      }, 0);
    });

    // Auto join when user is present
    socket.emit('join', { name: user.username, id: user.id });

    return () => {
      socket.off();
    };
  }, [user?.username, user]);

  useEffect(() => {
    const loadMore = () => {
      if (messages.length > 0) {
        socket.emit('loadMoreMessages', messages[0].id);
      }
    };
    const handleScroll = () => {
      if (chatRef.current) {
        const chatDiv = chatRef.current;
        const atBottom = chatDiv.scrollTop + chatDiv.clientHeight >= chatDiv.scrollHeight - 10;
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
        if (atBottom) {
          setNewMessagesCount(0);
        }
      }
      if (chatRef.current && chatRef.current.scrollTop === 0 && hasMore) {
        loadMore();
      }
    };
    const chatDiv = chatRef.current;
    if (chatDiv) {
      chatDiv.addEventListener('scroll', handleScroll);
      return () => chatDiv.removeEventListener('scroll', handleScroll);
    }
  }, [hasMore, messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      const msgData = { text: message };
      if (isPrivate && privateRecipient) {
        msgData.private = true;
        msgData.recipient = privateRecipient;
      }
      if (replyTo) {
        msgData.replyTo = replyTo.id;
        msgData.replyText = replyTo.text;
        msgData.replyUser = replyTo.userName;
      }
      socket.emit('ChatMessage', msgData);
      setMessage('');
      setReplyTo(null);
    }
  };

  const handleInput = (e) => {
    setMessage(e.target.value);
    socket.emit('typing');
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stopTyping');
    }, 1000);
  };

  const deleteMessage = (id) => {
    socket.emit('deleteMessage', id);
  };

  const kickUser = (username) => {
    socket.emit('kickUser', username);
  };

  const clearUsers = () => {
    socket.emit('clearUsers');
  };

  const clearMessages = () => {
    socket.emit('clearMessages');
  };

  const toggleExpand = (id) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleMenu = (index) => {
    setMenuOpen(menuOpen === index ? null : index);
  };

  const startEdit = (index) => {
    setEditingMessage(index);
    setMenuOpen(null);
  };

  const saveEdit = (index, newText) => {
    const msg = messages[index];
    if (msg.id) {
      socket.emit('editMessage', { id: msg.id, text: newText });
    }
    setEditingMessage(null);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
  };

  const startReply = (index) => {
    setReplyTo(messages[index]);
    setMenuOpen(null);
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  const handleLogout = () => {
    if (joined) {
      socket.emit('leave');
      setJoined(false);
    }
    setShowModal(false);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      backgroundColor: '#e9ecef', 
      display: 'flex', 
      flexDirection: 'column', 
      padding: 'clamp(10px, 5vw, 20px)', 
      boxSizing: 'border-box',
      fontFamily: 'Arial, sans-serif'
    }}>
      {isFounder && (
        <div style={{ marginBottom: '10px', display: 'flex', gap: '10px' }}>
          <button 
            onClick={clearUsers} 
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#dc3545', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              transition: 'background-color 0.3s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#c82333'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#dc3545'}
          >
            Clear Users
          </button>
          <button 
            onClick={clearMessages} 
            style={{ 
              padding: '8px 16px', 
              backgroundColor: '#ffc107', 
              color: 'black', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: 'pointer',
              transition: 'background-color 0.3s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#e0a800'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#ffc107'}
          >
            Clear Chat
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ 
          width: isMobile ? '100%' : 'clamp(200px, 25vw, 250px)', 
          border: '1px solid #ccc', 
          padding: '15px', 
          marginRight: isMobile ? '0' : 'clamp(10px, 2vw, 20px)', 
          marginBottom: isMobile ? '10px' : '0',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, color: '#333' }}>Online Users ({users.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {users.map(u => (
                <tr key={u}>
                  <td style={{ 
                    padding: '8px', 
                    border: '1px solid #ddd', 
                    cursor: isFounder && u !== user.username ? 'pointer' : 'default',
                    backgroundColor: isFounder && u !== user.username ? '#f8f9fa' : 'white',
                    borderRadius: '4px',
                    transition: 'background-color 0.3s',
                    fontWeight: u === user.username ? 'bold' : 'normal',
                    color: u === user.username ? '#007bff' : '#333'
                  }} 
                  onClick={() => isFounder && u !== user.username && kickUser(u)}
                  onMouseOver={(e) => isFounder && u !== user.username && (e.target.style.backgroundColor = '#e9ecef')}
                  onMouseOut={(e) => isFounder && u !== user.username && (e.target.style.backgroundColor = '#f8f9fa')}
                  >
                    {u === user.username ? 'You' : u}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4 style={{ marginTop: '20px', color: '#333' }}>Your Profile</h4>
          <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #ddd' }}>
            <p style={{ margin: '5px 0', fontSize: '14px' }}><strong>Username:</strong> {user.username}</p>
            <p style={{ margin: '5px 0', fontSize: '14px' }}><strong>Email:</strong> {user.email}</p>
            <p style={{ margin: '5px 0', fontSize: '14px' }}><strong>Role:</strong> {user.role}</p>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
          {showModal ? (
            <div style={{ 
              backgroundColor: 'white', 
              padding: '20px', 
              borderRadius: '8px', 
              width: '100%', 
              maxWidth: isMobile ? '100%' : 'min(600px, 90vw)', 
              maxHeight: '80vh', 
              display: 'flex', 
              flexDirection: 'column',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <button 
                  onClick={() => { socket.emit('leave'); setJoined(false); setShowModal(false); }}
                  style={{ 
                    padding: '8px 16px', 
                    backgroundColor: '#6c757d', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    transition: 'background-color 0.3s'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#5a6268'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#6c757d'}
                >
                  Leave Chat
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={handleLogout}
                    style={{ 
                      padding: '8px 16px', 
                      backgroundColor: '#dc3545', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: 'pointer',
                      transition: 'background-color 0.3s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#c82333'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#dc3545'}
                  >
                    Logout
                  </button>
                  <button 
                    onClick={() => setShowModal(false)}
                    style={{ 
                      padding: '8px 16px', 
                      backgroundColor: '#6c757d', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: 'pointer',
                      transition: 'background-color 0.3s'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#5a6268'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#6c757d'}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div ref={chatRef} style={{ 
                padding: '15px', 
                flex: 1, 
                overflowY: 'auto', 
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#f8f9fa',
                position: 'relative'
              }}>
                {messages.map((msg, index) => (
                  <div key={index} style={{ marginBottom: '10px', padding: '8px', borderRadius: '4px', backgroundColor: msg.system ? '#e9ecef' : msg.private ? '#fff3cd' : 'white', position: 'relative' }}>
                    {msg.system ? (
                      <div style={{ fontStyle: 'italic', color: '#666', fontSize: '14px' }}>{msg.text}</div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <strong style={{ color: msg.userName === user.username ? '#007bff' : '#333' }}>
                              {msg.private ? (
                                msg.userName === user.username ? `Private to ${msg.recipient}` : `Private from ${msg.userName}`
                              ) : (
                                msg.userName === user.username ? 'You' : msg.userName
                              )}:
                            </strong>
                            {msg.replyTo && (
                              <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px', padding: '4px', backgroundColor: '#f1f3f4', borderRadius: '4px' }}>
                                Replying to <strong>{msg.replyUser}</strong>: {msg.replyText}
                              </div>
                            )}
                            {editingMessage === index ? (
                              <div style={{ marginTop: '5px' }}>
                                <input
                                  type="text"
                                  defaultValue={msg.text}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      saveEdit(index, e.target.value);
                                    } else if (e.key === 'Escape') {
                                      cancelEdit();
                                    }
                                  }}
                                  style={{ width: '100%', padding: '5px', border: '1px solid #ccc', borderRadius: '4px' }}
                                  autoFocus
                                />
                                <div style={{ marginTop: '5px' }}>
                                  <button onClick={() => saveEdit(index, document.querySelector(`input[value="${msg.text}"]`).value)} style={{ padding: '2px 6px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '2px', marginRight: '5px' }}>Save</button>
                                  <button onClick={cancelEdit} style={{ padding: '2px 6px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '2px' }}>Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <span>
                                {(() => {
                                  const isExpanded = expandedMessages.has(msg.id);
                                  const maxLength = 100;
                                  const shouldTruncate = msg.text.length > maxLength;
                                  const displayText = shouldTruncate && !isExpanded ? msg.text.substring(0, maxLength) + '...' : msg.text;
                                  return (
                                    <>
                                      {displayText}
                                      {shouldTruncate && (
                                        <button 
                                          onClick={() => toggleExpand(msg.id)} 
                                          style={{ 
                                            marginLeft: '10px', 
                                            padding: '2px 6px', 
                                            fontSize: '12px',
                                            backgroundColor: '#28a745',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '2px',
                                            cursor: 'pointer'
                                          }}
                                        >
                                          {isExpanded ? 'Show Less' : 'Show More'}
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
                              </span>
                            )}
                          </div>
                          {!msg.system && (
                            <div style={{ position: 'relative' }}>
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleMenu(index); }} 
                                style={{ 
                                  background: 'none', 
                                  border: 'none', 
                                  cursor: 'pointer', 
                                  fontSize: '18px', 
                                  padding: '0 5px' 
                                }}
                              >
                                ⋮
                              </button>
                              {menuOpen === index && (
                                <div 
                                  onClick={(e) => e.stopPropagation()} 
                                  style={{ 
                                    position: 'absolute', 
                                    right: 0, 
                                    top: '20px', 
                                    backgroundColor: 'white', 
                                    border: '1px solid #ccc', 
                                    borderRadius: '4px', 
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)', 
                                    zIndex: 10,
                                    minWidth: '100px'
                                  }}
                                >
                                  <button 
                                    onClick={() => startReply(index)} 
                                    style={{ 
                                      display: 'block', 
                                      width: '100%', 
                                      padding: '8px', 
                                      background: 'none', 
                                      border: 'none', 
                                      textAlign: 'left', 
                                      cursor: 'pointer' 
                                    }}
                                  >
                                    Reply
                                  </button>
                                  {(msg.userName === user.username || isFounder) && (
                                    <button 
                                      onClick={() => startEdit(index)} 
                                      style={{ 
                                        display: 'block', 
                                        width: '100%', 
                                        padding: '8px', 
                                        background: 'none', 
                                        border: 'none', 
                                        textAlign: 'left', 
                                        cursor: 'pointer' 
                                      }}
                                    >
                                      Edit
                                    </button>
                                  )}
                                  {(msg.userName === user.username || isFounder) && msg.id && (
                                    <button 
                                      onClick={() => { deleteMessage(msg.id); setMenuOpen(null); }} 
                                      style={{ 
                                        display: 'block', 
                                        width: '100%', 
                                        padding: '8px', 
                                        background: 'none', 
                                        border: 'none', 
                                        textAlign: 'left', 
                                        cursor: 'pointer',
                                        color: '#dc3545'
                                      }}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {noMoreMessages && (
                <div style={{ textAlign: 'center', color: '#666', padding: '10px', fontSize: '14px' }}>
                  No more messages
                </div>
              )}
              {(!isAtBottom || newMessagesCount > 0) && (
                <button
                  onClick={() => {
                    if (chatRef.current) {
                      chatRef.current.scrollTop = chatRef.current.scrollHeight;
                      setIsAtBottom(true);
                      isAtBottomRef.current = true;
                      setNewMessagesCount(0);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    bottom: '80px',
                    right: '20px',
                    padding: '10px 15px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    fontSize: '14px'
                  }}
                >
                  Scroll to Bottom {newMessagesCount > 0 ? `(${newMessagesCount} new)` : ''}
                </button>
              )}
              <div style={{ fontStyle: 'italic', color: '#666', padding: '5px 15px', fontSize: '14px' }}>{typing}</div>
              {replyTo && (
                <div style={{ margin: '10px 15px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px', borderLeft: '4px solid #007bff' }}>
                  Replying to <strong>{replyTo.userName}</strong>: {replyTo.text}
                  <button onClick={cancelReply} style={{ marginLeft: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#6c757d' }}>✕</button>
                </div>
              )}
              <form onSubmit={sendMessage} style={{ display: 'flex', padding: '15px', borderTop: '1px solid #ccc', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <label style={{ marginRight: '10px' }}>
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                    />
                    Private Message
                  </label>
                  {isPrivate && (
                    <select
                      value={privateRecipient}
                      onChange={(e) => setPrivateRecipient(e.target.value)}
                      style={{ padding: '5px', border: '1px solid #ccc', borderRadius: '4px' }}
                    >
                      <option value="">Select Recipient</option>
                      {users.filter(u => u !== user.username).map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={{ display: 'flex' }}>
                  <textarea
                    value={message}
                    onChange={handleInput}
                    placeholder={isPrivate ? "Type private message..." : "Type your message..."}
                    style={{ 
                      flex: 1, 
                      padding: '12px', 
                      border: '1px solid #ccc', 
                      borderRadius: '4px', 
                      fontSize: '16px',
                      marginRight: '10px',
                      resize: 'vertical',
                      minHeight: '40px',
                      maxHeight: '120px',
                      overflowY: 'auto'
                    }}
                    rows={1}
                    required
                  />
                  <button 
                    type="submit" 
                    style={{ 
                      padding: '12px 20px', 
                      backgroundColor: '#007bff', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: 'pointer',
                      transition: 'background-color 0.3s',
                      alignSelf: 'flex-start'
                    }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#0056b3'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#007bff'}
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <button 
              onClick={() => setShowModal(!showModal)} 
              style={{ 
                padding: 'clamp(15px, 5vw, 20px) clamp(30px, 10vw, 40px)', 
                fontSize: 'clamp(14px, 4vw, 18px)',
                width: isMobile ? '100%' : 'auto',
                backgroundColor: showModal ? '#dc3545' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                transition: 'all 0.3s'
              }}
              onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
              onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
            >
              {showModal ? 'Close Chat' : 'Open Chat'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chat;