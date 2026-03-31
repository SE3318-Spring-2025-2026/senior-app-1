package com.sude.backend.service;

import com.sude.backend.entity.Professor;
import com.sude.backend.repository.ProfessorRepository;
import org.springframework.stereotype.Service;

@Service
public class ProfessorService {

    private final ProfessorRepository professorRepository;

    public ProfessorService(ProfessorRepository professorRepository) {
        this.professorRepository = professorRepository;
    }

 public Professor createProfessor(String email, String fullName, String department) {

    Professor professor = new Professor();
    professor.setEmail(email);
    professor.setFullName(fullName);
    professor.setDepartment(department);
    professor.setSetupRequired(true);

    return professorRepository.save(professor);
}
}