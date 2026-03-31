package com.sude.backend.repository;

import com.sude.backend.entity.ProfessorSetupToken;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ProfessorSetupTokenRepository extends JpaRepository<ProfessorSetupToken, Long> {
    Optional<ProfessorSetupToken> findByToken(String token);
}