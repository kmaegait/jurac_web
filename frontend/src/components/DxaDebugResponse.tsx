import React, { useState } from 'react';
import { DxaResponse, DxaTask, DxaTaskResult, DxaTaskCitation } from '../types';
import { motion } from 'framer-motion';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  Paper,
  Divider,
} from '@mui/material';
import {
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  Assignment as TaskIcon,
  Description as ResultIcon,
  Link as CitationIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

interface DxaDebugResponseProps {
  response: DxaResponse | null;
  onClose: () => void;
}

const DxaDebugResponse: React.FC<DxaDebugResponseProps> = ({ response, onClose }) => {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [expandedTasks, setExpandedTasks] = useState<{ [key: string]: boolean }>({});
  const [expandedCitations, setExpandedCitations] = useState<{ [key: string]: boolean }>({});

  if (!response) return null;

  const handleTaskClick = (taskId: string) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  const handleCitationClick = (citationId: string) => {
    setExpandedCitations(prev => ({
      ...prev,
      [citationId]: !prev[citationId]
    }));
  };

  const renderCitation = (citation: DxaTaskCitation, index: number) => {
    const citationId = `citation-${index}`;
    const isExpanded = expandedCitations[citationId];

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.1 }}
        key={citationId}
      >
        <Paper
          elevation={2}
          sx={{
            mt: 1,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              p: 1,
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              bgcolor: isExpanded ? 'primary.dark' : 'primary.main',
              color: 'primary.contrastText',
              transition: 'background-color 0.3s ease',
            }}
            onClick={() => handleCitationClick(citationId)}
          >
            <CitationIcon sx={{ mr: 1 }} />
            <Typography variant="subtitle2">
              Citation {index + 1}: {citation.source}
            </Typography>
            <IconButton
              size="small"
              sx={{ ml: 'auto', color: 'inherit' }}
            >
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
          </Box>
          <Collapse in={isExpanded}>
            <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>File:</strong> {citation.file_path}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Page:</strong> {citation.page_index}
              </Typography>
              <Typography variant="body2">
                <strong>Type:</strong> {citation.type}
              </Typography>
            </Box>
          </Collapse>
        </Paper>
      </motion.div>
    );
  };

  const renderTaskResult = (result: DxaTaskResult) => (
    <Box sx={{ mt: 2 }}>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Typography variant="h6" sx={{ mb: 2, color: 'primary.main' }}>
          <ResultIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Result
        </Typography>
        <Paper elevation={2} sx={{ p: 2, bgcolor: 'background.paper' }}>
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
            {result.content}
          </Typography>
          {result.citations.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Citations
              </Typography>
              {result.citations.map((citation, idx) => renderCitation(citation, idx))}
            </>
          )}
        </Paper>
      </motion.div>
    </Box>
  );

  const renderTask = (task: DxaTask, index: number) => {
    const taskId = `task-${index}`;
    const isExpanded = expandedTasks[taskId];

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.1 }}
        key={taskId}
      >
        <Paper
          elevation={3}
          sx={{
            mt: 2,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box
            sx={{
              p: 2,
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              bgcolor: isExpanded ? 'primary.dark' : 'primary.main',
              color: 'primary.contrastText',
              transition: 'background-color 0.3s ease',
            }}
            onClick={() => handleTaskClick(taskId)}
          >
            <TaskIcon sx={{ mr: 1 }} />
            <Typography variant="subtitle1">
              Task {index + 1}: {task.task}
            </Typography>
            <IconButton
              size="small"
              sx={{ ml: 'auto', color: 'inherit' }}
            >
              {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
            </IconButton>
          </Box>
          <Collapse in={isExpanded}>
            <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Status:</strong> {task.status}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Task ID:</strong> {task.task_id}
              </Typography>
              {task.task_result && renderTaskResult(task.task_result)}
            </Box>
          </Collapse>
        </Paper>
      </motion.div>
    );
  };

  const steps = [
    {
      label: 'Main Task',
      content: (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Typography variant="h6" gutterBottom color="primary.main">
            {response.answer.response.main_task}
          </Typography>
          {renderTaskResult(response.answer.response.task_result)}
        </motion.div>
      ),
    },
    {
      label: 'Subtasks',
      content: (
        <motion.div>
          {response.answer.response.substasks.map((task, idx) => renderTask(task, idx))}
        </motion.div>
      ),
    },
  ];

  return (
    <Box
      component={motion.div}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        margin: '0 auto',
        width: '90%',
        maxWidth: '1200px',
        maxHeight: '60vh',
        overflowY: 'auto',
        bgcolor: 'background.paper',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        boxShadow: '0px -2px 10px rgba(0, 0, 0, 0.1)',
        p: 3,
        zIndex: 1000,
      }}
    >
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 2,
        position: 'sticky',
        top: 0,
        bgcolor: 'background.paper',
        zIndex: 1,
        pb: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}>
        <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', color: 'text.primary' }}>
          <TaskIcon sx={{ mr: 1 }} />
          DXA Analysis Results
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{
            color: 'text.primary',
            bgcolor: 'rgba(255, 255, 255, 0.08)',
            '&:hover': {
              bgcolor: 'rgba(255, 255, 255, 0.12)',
            },
            padding: '8px',
          }}
        >
          <CloseIcon />
        </IconButton>
      </Box>
      
      <Box sx={{ mt: 2 }}>
        {steps[activeStep].content}
      </Box>

      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center',
        mt: 3,
        gap: 2,
        position: 'sticky',
        bottom: 0,
        bgcolor: 'background.paper',
        pt: 2,
        borderTop: 1,
        borderColor: 'divider',
      }}>
        {steps.map((step, index) => (
          <motion.div
            key={index}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Paper
              sx={{
                px: 3,
                py: 1,
                cursor: 'pointer',
                bgcolor: activeStep === index ? 'primary.main' : 'background.paper',
                color: activeStep === index ? 'primary.contrastText' : 'text.primary',
                '&:hover': {
                  bgcolor: activeStep === index ? 'primary.dark' : 'action.hover',
                },
              }}
              elevation={activeStep === index ? 4 : 1}
              onClick={() => setActiveStep(index)}
            >
              <Typography variant="button">
                {step.label}
              </Typography>
            </Paper>
          </motion.div>
        ))}
      </Box>
    </Box>
  );
};

export default DxaDebugResponse; 