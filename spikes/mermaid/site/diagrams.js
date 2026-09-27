// The five diagram types rendered by every variant.
window.DIAGRAMS = {
  flowchart: `flowchart LR
  producer[Producer] -- "put waits while full" --> queue[(Bounded queue)]
  worker[Consumer] e1@-->|get removes one| queue
  queue -.-> done{{Done?}}`,
  sequence: `sequenceDiagram
  participant P as Producer
  participant Q as Queue
  P->>Q: put(item)
  Q-->>P: waits while full
  Note over P,Q: capacity bound`,
  state: `stateDiagram-v2
  [*] --> Idle
  Idle --> Connecting : demand / dial
  Connecting --> Open : handshake done
  Open --> Closed : close
  Closed --> [*]`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  CUSTOMER { string id PK
    string name }`,
  class: `classDiagram
  class BoundedQueue {
    +int capacity
    +put(item)
    +get() Item
  }
  BoundedQueue <|-- DropQueue
  BoundedQueue o-- Condition`,
};
