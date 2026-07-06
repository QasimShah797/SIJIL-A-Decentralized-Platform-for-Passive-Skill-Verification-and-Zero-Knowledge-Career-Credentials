import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function AttestationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      navigate(`/institution/attestation-request/${id}`, { replace: true });
      return;
    }
    navigate("/institution/queue", { replace: true });
  }, [id, navigate]);

  return null;
}
