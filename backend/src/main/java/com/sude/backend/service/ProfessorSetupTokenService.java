package com.sude.backend.service;

import com.sude.backend.entity.Professor;
import com.sude.backend.entity.ProfessorSetupToken;
import com.sude.backend.repository.ProfessorRepository;
import com.sude.backend.repository.ProfessorSetupTokenRepository;
import org.springframework.stereotype.Service;

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
}