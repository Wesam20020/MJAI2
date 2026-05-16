import { CheckCircle2, Sparkles } from 'lucide-react';

function QuestionCard({ question, selectedOptionId, onSelect, index }) {
  return (
    <div className="question-card glass-panel-soft">
      <div className="question-topline">
        <span className="question-number">{index + 1}</span>
        <span className="question-chip">
          <Sparkles size={14} />
          {question.category}
        </span>
      </div>

      <h3>{question.questionText}</h3>

      <div className="options-container">
        {question.options.map((option) => {
          const active = selectedOptionId === option.id;
          return (
            <label className={`option-item ${active ? 'option-item-active' : ''}`} key={option.id}>
              <input
                type="radio"
                name={`question-${question.id}`}
                checked={active}
                onChange={() => onSelect(question.id, option.id)}
              />
              <span className="option-copy">{option.optionText}</span>
              {active && <CheckCircle2 size={16} className="option-check" />}
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default QuestionCard;
