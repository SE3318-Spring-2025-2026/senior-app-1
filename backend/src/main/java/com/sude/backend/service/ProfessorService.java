package com.sude.backend.service;

import com.sude.backend.entity.Professor;
import com.sude.backend.repository.ProfessorRepository;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;

@Service
public class ProfessorService {

    private final ProfessorRepository professorRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    public ProfessorService(ProfessorRepository professorRepository) {
        this.professorRepository = professorRepository;
    }

    public Professor createProfessor(String email, String fullName, String department) {

        Professor professor = new Professor();
        professor.setEmail(email);
        professor.setFullName(fullName);
        professor.setDepartment(department);
        professor.setSetupRequired(true);

        // Generate secure setup token
        String setupToken = generateSecureToken();
        professor.setSetupToken(setupToken);
        professor.setSetupTokenExpires(LocalDateTime.now().plusHours(24)); // Expires in 24 hours

        return professorRepository.save(professor);
    }

    private String generateSecureToken() {
        byte[] tokenBytes = new byte[32];
        secureRandom.nextBytes(tokenBytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : tokenBytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}