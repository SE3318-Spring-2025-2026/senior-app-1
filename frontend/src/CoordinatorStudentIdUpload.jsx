
import React, { useState } from 'react';
import { useNotification } from './NotificationContext';
import './styles.css';

export default function CoordinatorStudentIdUpload() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { showNotification } = useNotification();

  // Simulate role check (replace with real auth in production)
  const isCoordinator = true; // TODO: Replace with real role check

  const handleSubmit = async (e) => {
    e.preventDefault();
    let ids = input
      .split(/\s|,|;/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (ids.length === 0) {
      showNotification('error', 'Lütfen en az bir öğrenci numarası girin.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/coordinator/student-id-registry/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentIds: ids }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Yükleme başarısız.');
      }
      const data = await res.json();
      showNotification(
        'success',
        `Yükleme tamamlandı. Eklenen: ${data.inserted}, Tekrar: ${data.duplicates}, Format Hatalı: ${data.invalidFormat}`
      );
      setInput('');
    } catch (err) {
      showNotification('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isCoordinator) {
    return <div className="error">Bu sayfaya erişim yetkiniz yok.</div>;
  }

  return (
    <div className="coordinator-upload-container">
      <h2>Geçerli Öğrenci Numarası Yükle</h2>
      <form onSubmit={handleSubmit} className="upload-form">
        <label htmlFor="studentIds">Öğrenci Numaraları (her satıra bir tane veya virgül/boşluk ile ayırın):</label>
        <textarea
          id="studentIds"
          rows={8}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="11070001000\n11070001001\n11070001002"
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Yükleniyor...' : 'Yükle'}
        </button>
      </form>
    </div>
  );
}
