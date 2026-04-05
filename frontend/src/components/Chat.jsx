import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../services/apiClient';

const Chat = () => {
  const [model, setModel] = useState('opus');
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    try {
      const res = await apiClient.post('/ai/chat', { model, message });
      setResponse(res.data.response);
    } catch (error) {
      setResponse('Error: ' + (error.mappedError?.title || 'Failed to get response'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-section">
      <h2>AI Chat</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Model:
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="opus">Opus 4.6 (Anthropic)</option>
            <option value="gpt">GPT 5.4 (OpenAI)</option>
          </select>
        </label>
        <label>
          Message:
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter your message..."
            rows="3"
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
      {response && (
        <div className="response">
          <h3>Response:</h3>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
};

export default Chat;