package com.sude.backend.service;

import com.sude.backend.entity.Professor;
import com.sude.backend.entity.ProfessorSetupToken;
import com.sude.backend.repository.ProfessorRepository;
import com.sude.backend.repository.ProfessorSetupTokenRepository;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
public class ProfessorSetupTokenService {

    private final ProfessorRepository professorRepository;
    private final ProfessorSetupTokenRepository tokenRepository;

    public ProfessorSetupTokenService(ProfessorRepository professorRepository,
                                      ProfessorSetupTokenRepository tokenRepository) {
        this.professorRepository = professorRepository;
        this.tokenRepository = tokenRepository;
    }

    public String generateToken(Long professorId) {

        // 1. Professor var mı kontrol
        Professor professor = professorRepository.findById(professorId)
                .orElseThrow(() -> new RuntimeException("Professor not found"));

        // 2. Token üret
        String token = UUID.randomUUID().toString();

        // 3. Entity oluştur
        ProfessorSetupToken setupToken = new ProfessorSetupToken(token, professor);

        // 4. DB'ye kaydet
        tokenRepository.save(setupToken);

        // 5. Token döndür
        return token;
    }
    public void setupProfessor(String token, String password) {

    // 1. Token var mı?
    ProfessorSetupToken setupToken = tokenRepository.findByToken(token)
            .orElseThrow(() -> new RuntimeException("Invalid token"));

    // 2. Token kullanılmış mı?
    if (setupToken.isUsed()) {
        throw new RuntimeException("Token already used");
    }

    // 3. Token süresi geçmiş mi?
    if (setupToken.getExpiresAt().isBefore(LocalDateTime.now())) {
        throw new RuntimeException("Token expired");
    }

    // 4. Professor'u al
    Professor professor = setupToken.getProfessor();

    // 5. Password set et
    professor.setPassword(password);

    // 6. Setup tamamlandı
    professor.setSetupRequired(false);

    // 7. Token kullanıldı
    setupToken.setUsed(true);

    // 8. Kaydet
    professorRepository.save(professor);
    tokenRepository.save(setupToken);
}
}