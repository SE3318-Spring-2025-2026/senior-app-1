package com.sude.backend.controller;
import org.springframework.stereotype.Controller;
import com.sude.backend.entity.Professor;
import com.sude.backend.service.ProfessorService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final ProfessorService professorService;

    public AdminController(ProfessorService professorService) {
        this.professorService = professorService;
    }

    @PostMapping("/professors")
    public Professor createProfessor(@RequestBody Professor request) {
        return professorService.createProfessor(
                request.getEmail(),
                request.getFullName(),
                request.getDepartment()
        );
    }
}